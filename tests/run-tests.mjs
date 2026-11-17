// Headless tests for ECHO SHIFT — no browser needed. The world module is DOM-free, so
// Node drives the real simulation: a steering bot plays scripted solutions for all 12
// story levels, plus unit checks for lasers, drones, crates, echoes and medals.
// Run: node tests/run-tests.mjs   (exit 0 = everything passed)
import { createRandom } from '../game/src/random.js';
import { LEVELS, generateEndlessRoom } from '../game/src/levels.js';
import {
  EVENT_ALARM, EVENT_COMPLETE, createWorld,
} from '../game/src/world.js';
import { STEP } from '../game/src/config.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------- bot ---
class Bot {
  constructor(world) {
    this.world = world;
    this.ticks = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.stuckTicks = 0;
    this.flipUntil = 0;
  }

  step(input) {
    const events = this.world.step(STEP, input);
    this.ticks += 1;
    return events;
  }

  /** Steer toward tile (tx, ty) for one tick. Returns true when arrived. */
  steerTick(tx, ty) {
    const p = this.world.state.player;
    const dx = tx + 0.5 - p.x;
    const dy = ty + 0.5 - p.y;
    if (Math.hypot(dx, dy) < 0.15) return true;
    // Stuck detection: barely moving while pushing a direction → flip the axis.
    if (Math.hypot(p.x - this.lastX, p.y - this.lastY) < 0.002) {
      this.stuckTicks += 1;
      if (this.stuckTicks > 40) {
        this.flipUntil = this.ticks + 30;
        this.stuckTicks = 0;
      }
    } else {
      this.stuckTicks = 0;
    }
    this.lastX = p.x;
    this.lastY = p.y;
    const flipped = this.ticks < this.flipUntil;
    let mx = 0;
    let my = 0;
    const xFirst = flipped ? Math.abs(dy) >= Math.abs(dx) : Math.abs(dx) >= Math.abs(dy);
    if (xFirst) mx = Math.sign(dx);
    else my = Math.sign(dy);
    this.step({ mx, my, reset: false });
    return false;
  }

  /** Breadth-first path over walkable tiles (walls and closed doors block; crates block). */
  findPath(tx, ty) {
    const st = this.world.state;
    const grid = st.parsed.grid;
    const startC = Math.floor(st.player.x);
    const startR = Math.floor(st.player.y);
    const doorOpen = (c, r) => {
      for (const d of st.parsed.doors) if (d.x === c && d.y === r) return d.open;
      return false;
    };
    const crateTiles = new Set(st.crates.map((c) => `${Math.floor(c.x)},${Math.floor(c.y)}`));
    const passable = (c, r) => {
      if (c < 0 || c >= 20 || r < 0 || r >= 11) return false;
      const ch = grid[r][c];
      if (ch === '#') return false;
      if ('GHJKD'.includes(ch)) return doorOpen(c, r);
      if (crateTiles.has(`${c},${r}`)) return false;
      // A lit laser is a wall to the bot; a dark one (switch held, or timed off) is floor.
      if (ch === '-' || ch === '|') return st.lasersOff;
      if (ch === 't') return st.loopTime % 4 >= 2;
      if (ch === 'T') return st.loopTime % 4 < 2;
      return true;
    };
    if (!passable(tx, ty)) return null;
    const key = (c, r) => `${c},${r}`;
    const prev = new Map();
    const queue = [[startC, startR]];
    prev.set(key(startC, startR), null);
    while (queue.length > 0) {
      const [c, r] = queue.shift();
      if (c === tx && r === ty) {
        const path = [];
        let cur = key(c, r);
        while (cur !== null) {
          const [pc, pr] = cur.split(',').map(Number);
          path.unshift([pc, pr]);
          cur = prev.get(cur);
        }
        return path;
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (!passable(nc, nr) || prev.has(key(nc, nr))) continue;
        prev.set(key(nc, nr), key(c, r));
        queue.push([nc, nr]);
      }
    }
    return null;
  }

  goto(tx, ty, maxTicks = 3600) {
    const start = this.ticks;
    let path = null;
    let pathAge = 0;
    let waypoint = 0;
    while (this.ticks - start < maxTicks) {
      if (!path || pathAge > 45) {
        path = this.findPath(tx, ty);
        pathAge = 0;
        waypoint = 0;
        if (!path) {
          // No route right now (a door may still be latched shut): wait a little.
          this.step({ mx: 0, my: 0, reset: false });
          pathAge += 1;
          continue;
        }
      }
      pathAge += 1;
      if (waypoint >= path.length) return true;
      const [wc, wr] = path[waypoint];
      if (this.steerTick(wc, wr)) waypoint += 1;
      if (this.world.state.complete) return true;
    }
    return false;
  }

  wait(n) {
    for (let i = 0; i < n; i += 1) this.step({ mx: 0, my: 0, reset: false });
  }

  /** Wait until pred(state) is true, or an alarm fires, or the budget runs out. */
  waitFor(pred, maxTicks = 3600) {
    const start = this.ticks;
    while (this.ticks - start < maxTicks) {
      const events = this.step({ mx: 0, my: 0, reset: false });
      if (pred(this.world.state)) return true;
      if (events & EVENT_ALARM) return true;
      if (this.world.state.complete) return true;
    }
    return false;
  }

  waitForAlarm(maxTicks = 1200) {
    const start = this.ticks;
    while (this.ticks - start < maxTicks) {
      const events = this.step({ mx: 0, my: 0, reset: false });
      if (events & EVENT_ALARM) return true;
    }
    return false;
  }

  reset() {
    this.step({ mx: 0, my: 0, reset: true });
  }

  /** Push crate `idx` onto tile (tx, ty) by shoving it axis by axis. */
  push(crateIdx, tx, ty, maxTicks = 3600) {
    const start = this.ticks;
    while (this.ticks - start < maxTicks) {
      const crate = this.world.state.crates[crateIdx];
      if (!crate) return false;
      const dx = tx + 0.5 - crate.x;
      const dy = ty + 0.5 - crate.y;
      if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return true;
      const axisX = Math.abs(dx) >= Math.abs(dy);
      const dir = axisX ? Math.sign(dx) : Math.sign(dy);
      const px = crate.x - (axisX ? dir : 0);
      const py = crate.y - (axisX ? 0 : dir);
      const p = this.world.state.player;
      // Position via BFS, which treats the crate's tile as blocked — steering straight
      // at the spot behind the crate would shove the crate to the wrong row.
      if (Math.hypot(px - p.x, py - p.y) > 0.35) {
        if (!this.goto(Math.floor(px), Math.floor(py), 900)) return false;
      } else {
        this.step({ mx: axisX ? dir : 0, my: axisX ? 0 : dir, reset: false });
      }
      if (this.world.state.complete) return true;
    }
    return false;
  }
}

// ------------------------------------------------------- solutions ---
// Each step: ['goto', x, y] | ['wait', ticks] | ['waitFor', pred, label]
//          | ['reset'] | ['push', crateIdx, x, y] | ['waitForAlarm']
const SOLUTIONS = {
  1: [['goto', 8, 1], ['goto', 10, 9]],
  2: [['goto', 7, 1], ['push', 0, 7, 3], ['goto', 5, 3], ['goto', 5, 7], ['goto', 10, 9], ['goto', 15, 9]],
  3: [['goto', 3, 2], ['wait', 30], ['reset'], ['latch', 16, 2], ['goto', 5, 4], ['goto', 5, 7], ['goto', 10, 9], ['goto', 15, 9]],
  4: [['goto', 5, 5], ['wait', 60], ['reset'], ['wait', 120], ['goto', 15, 5], ['goto', 15, 9]],
  5: [
    ['waitFor', (s) => s.loopTime % 4 < 0.5, 'T off'],
    ['goto', 5, 4],
    ['waitFor', (s) => { const p = s.loopTime % 4; return p >= 2 && p < 2.5; }, 't off'],
    ['goto', 5, 1], ['goto', 15, 1],
  ],
  6: [['waitFor', (s) => s.drones[0].x > 15, 'drone far right'], ['goto', 10, 8], ['goto', 15, 8]],
  7: [
    ['waitFor', (s) => s.drones[0].x > 14 && s.drones[0].dir === 1, 'drone far right'],
    ['goto', 4, 5], ['waitForAlarm'], ['reset'], ['wait', 150],
    ['goto', 13, 7], ['goto', 16, 9],
  ],
  8: [
    ['goto', 4, 1], ['wait', 30], ['reset'],
    ['waitFor', (s) => s.drones[0].x < 6 && s.drones[0].dir === -1, 'drone far left'],
    ['latch', 14, 5],
    ['goto', 5, 7], ['goto', 5, 9], ['goto', 10, 9], ['goto', 15, 9],
  ],
  9: [
    ['goto', 4, 1], ['wait', 30], ['reset'],
    ['goto', 10, 1], ['wait', 30], ['reset'],
    ['latch', 17, 1],
    ['goto', 5, 7], ['goto', 5, 9], ['goto', 10, 9], ['goto', 15, 9],
  ],
  10: [['push', 0, 7, 2], ['push', 0, 7, 4], ['push', 0, 9, 4], ['goto', 5, 5], ['goto', 5, 7], ['goto', 10, 9], ['goto', 15, 9]],
  11: [
    ['waitFor', (s) => s.drones[0].x > 16 && s.drones[0].dir === 1, 'drone far right'],
    ['goto', 4, 1], ['wait', 30], ['reset'],
    ['waitFor', (s) => s.drones[0].x > 16 && s.drones[0].dir === 1, 'drone far right'],
    ['goto', 10, 1], ['wait', 30], ['reset'],
    ['latch', 15, 5],
    ['goto', 5, 7], ['goto', 5, 9], ['goto', 10, 9], ['goto', 15, 9],
  ],
  12: [
    ['waitFor', (s) => s.drones[0].x > 14 && s.drones[0].dir === 1, 'drone far right'],
    ['goto', 4, 1], ['wait', 30], ['reset'],
    ['goto', 11, 1], ['wait', 30], ['reset'],
    ['waitFor', (s) => s.drones[0].distracted > 0 || s.drones[0].x > 14, 'drone busy or far right'],
    ['goto', 5, 5], ['wait', 30], ['reset'],
    ['latch', 15, 5],
    ['goto', 5, 7], ['goto', 5, 9],
    ['waitFor', (s) => { const p = s.loopTime % 4; return p >= 2 && p < 3.2; }, 't off'],
    ['goto', 12, 9], ['goto', 16, 9],
  ],
};

function runSolution(world, def, steps) {
  world.loadLevel(def, 'story');
  const bot = new Bot(world);
  for (const step of steps) {
    const kind = step[0];
    let ok = true;
    if (kind === 'goto') ok = bot.goto(step[1], step[2]);
    else if (kind === 'wait') bot.wait(step[1]);
    else if (kind === 'waitFor') ok = bot.waitFor(step[1]);
    else if (kind === 'waitForAlarm') ok = bot.waitForAlarm();
    else if (kind === 'reset') bot.reset();
    else if (kind === 'latch') {
      // Stand on the final plate until the door actually latches; if an alarm knocks
      // the player off, walk back and try again (up to 3 times). NOTE: waitFor returns
      // true on an alarm too, so the door itself is the only success signal.
      ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
        bot.goto(step[1], step[2]);
        bot.waitFor((s) => s.parsed.doors[0].open, 900);
        ok = world.state.parsed.doors[0].open;
      }
    }
    else if (kind === 'push') ok = bot.push(step[1], step[2], step[3]);
    if (!ok) return { ok: false, at: step, ticks: bot.ticks, state: world.state };
    if (world.state.complete) break;
  }
  return { ok: world.state.complete, ticks: bot.ticks, state: world.state };
}

// ------------------------------------------------------------- tests ---
console.log('== map validation ==');
const VALID = new Set('#.PAX123Ws-|tToOCGHJKD'.split(''));
for (const level of LEVELS) {
  const rows = level.map;
  let bad = '';
  if (rows.length !== 11) bad = `rows=${rows.length}`;
  else {
    for (const row of rows) {
      if (row.length !== 20) { bad = `row length ${row.length}`; break; }
      for (const ch of row) if (!VALID.has(ch)) { bad = `bad char ${ch}`; break; }
    }
  }
  const flat = rows.join('');
  const count = (ch) => [...flat].filter((c) => c === ch).length;
  if (!bad && count('P') !== 1) bad = `P=${count('P')}`;
  if (!bad && count('X') !== 1) bad = `X=${count('X')}`;
  if (!bad && count('A') < 1) bad = 'no artifact';
  check(`L${level.id} ${level.name} map valid`, !bad, bad);
}

console.log('== story solutions (bot plays each level) ==');
for (const level of LEVELS) {
  const steps = SOLUTIONS[level.id];
  let result = null;
  let attempts = 0;
  for (attempts = 1; attempts <= 3; attempts += 1) {
    const world = createWorld(createRandom(1));
    result = runSolution(world, level, steps);
    if (result.ok) break;
  }
  const st = result.state;
  const medal = result.ok ? createWorld(createRandom(1)).medalFor(level, st.time, st.resets, st.alarms) : '-';
  check(
    `L${level.id} ${level.name} solvable`,
    result.ok,
    result.ok
      ? `attempt ${attempts}, ${(result.ticks / 60).toFixed(1)}s, time ${st.time.toFixed(1)}s, resets ${st.resets}, alarms ${st.alarms}, echoes ${st.echoes.length}, medal ${medal}`
      : `failed at step ${JSON.stringify(result.at)} after ${result.ticks} ticks`,
  );
}

console.log('== unit: lasers, drones, crates, echoes, medals ==');
{
  // Laser burns a player who walks into it while the switch is unpressed.
  const world = createWorld(createRandom(1));
  world.loadLevel(LEVELS[3], 'story');
  const bot = new Bot(world);
  bot.goto(9, 5);
  let alarmed = false;
  for (let i = 0; i < 600 && !alarmed; i += 1) {
    const events = bot.step({ mx: 1, my: 0, reset: false });
    if (events & EVENT_ALARM) alarmed = true;
  }
  check('L4 laser alarms an unprotected crossing', alarmed);
}
{
  // A drone spots a player standing in front of it.
  const world = createWorld(createRandom(1));
  world.loadLevel(LEVELS[5], 'story');
  const st = world.state;
  const drone = st.drones[0];
  st.player.x = drone.x + 2;
  st.player.y = drone.y;
  let alarmed = false;
  for (let i = 0; i < 30 && !alarmed; i += 1) {
    const events = world.step(STEP, { mx: 0, my: 0, reset: false });
    if (events & EVENT_ALARM) alarmed = true;
  }
  check('L6 drone alarms a player in its cone', alarmed);
  // ...and ignores a player standing behind it.
  const world2 = createWorld(createRandom(1));
  world2.loadLevel(LEVELS[5], 'story');
  const d2 = world2.state.drones[0];
  world2.state.player.x = d2.x - 2;
  world2.state.player.y = d2.y;
  let alarmed2 = false;
  for (let i = 0; i < 30 && !alarmed2; i += 1) {
    const events = world2.step(STEP, { mx: 0, my: 0, reset: false });
    if (events & EVENT_ALARM) alarmed2 = true;
  }
  check('L6 drone ignores a player behind it', !alarmed2);
}
{
  // Echo replay: positions during replay match the recording exactly, and the echo
  // freezes on the plate afterwards, keeping it pressed.
  const world = createWorld(createRandom(1));
  world.loadLevel(LEVELS[2], 'story');
  const bot = new Bot(world);
  bot.goto(3, 2);
  bot.wait(30);
  const recorded = world.state.recording.slice();
  bot.reset();
  const echo = world.state.echoes[0];
  let accurate = !!echo && echo.frames.length === recorded.length;
  for (let i = 0; i < Math.min(120, recorded.length) && accurate; i += 1) {
    world.step(STEP, { mx: 0, my: 0, reset: false });
    const frame = echo.frames[Math.min(echo.t, echo.frames.length - 1)];
    if (Math.abs(echo.x - frame.x) > 0.001 || Math.abs(echo.y - frame.y) > 0.001) accurate = false;
  }
  check('Echo replays its recording exactly', accurate, `frames=${recorded.length}`);
  // Run the replay to its end and check the echo froze on plate 1.
  for (let i = 0; i < recorded.length + 10; i += 1) world.step(STEP, { mx: 0, my: 0, reset: false });
  const plate1 = world.state.parsed.plates.find((p) => p.id === '1');
  check('Echo freezes on plate 1 and keeps it pressed', echo.done && plate1.pressed, `done=${echo.done} pressed=${plate1.pressed}`);
}
{
  // Crate onto the heavy plate latches door D (level 2).
  const world = createWorld(createRandom(1));
  world.loadLevel(LEVELS[1], 'story');
  const bot = new Bot(world);
  bot.goto(7, 1);
  const pushed = bot.push(0, 7, 3);
  const door = world.state.parsed.doors[0];
  check('L2 crate on heavy plate latches the door', pushed && door.open, `pushed=${pushed} open=${door.open}`);
}
{
  // Reset cap: at most maxEchoes echoes can exist.
  const world = createWorld(createRandom(1));
  world.loadLevel(LEVELS[8], 'story');
  const bot = new Bot(world);
  for (let i = 0; i < 5; i += 1) {
    bot.goto(4 + i, 1);
    bot.wait(20);
    bot.reset();
  }
  check('Echo count never exceeds the level cap', world.state.echoes.length <= 3, `echoes=${world.state.echoes.length}`);
}
{
  // Medals and scores behave: perfect run beats a sloppy one.
  const world = createWorld(createRandom(1));
  const perfect = world.medalFor(LEVELS[0], 10, 0, 0);
  const gold = world.medalFor(LEVELS[0], 20, 0, 1);
  const bronze = world.medalFor(LEVELS[0], 100, 5, 5);
  const sPerfect = world.scoreFor(LEVELS[0], 10, 0, 0, perfect);
  const sBronze = world.scoreFor(LEVELS[0], 100, 5, 5, bronze);
  check('Medals rank Perfect > Gold > Bronze', perfect === 'Perfect Echo' && gold === 'Gold' && bronze === 'Bronze', `${perfect}/${gold}/${bronze}`);
  check('Perfect score beats bronze score', sPerfect > sBronze, `${sPerfect} > ${sBronze}`);
}
{
  // Timeout fires when the clock runs out.
  const world = createWorld(createRandom(1));
  world.loadLevel(LEVELS[0], 'story');
  let timedOut = false;
  for (let i = 0; i < 60 * 130; i += 1) {
    const events = world.step(STEP, { mx: 0, my: 0, reset: false });
    if (world.state.failed) { timedOut = true; break; }
  }
  check('Time limit fails the level', timedOut && world.state.failed);
}

console.log('== endless rooms ==');
for (let room = 1; room <= 3; room += 1) {
  const def = generateEndlessRoom(createRandom(room * 31 + 7), room);
  const rowsOk = def.map.length === 11 && def.map.every((r) => r.length === 20);
  const flat = def.map.join('');
  const count = (ch) => [...flat].filter((c) => c === ch).length;
  check(`Endless room ${room} map valid`, rowsOk && count('P') === 1 && count('X') === 1 && count('A') >= 1, `A=${count('A')}`);
  // Bot solution: press both plates, grab every artifact, reach the exit.
  let ok = false;
  let detail = '';
  for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
    const world = createWorld(createRandom(room));
    world.loadLevel(def, 'endless', room);
    const parsed = world.state.parsed;
    const bot = new Bot(world);
    const steps = [];
    // The door needs plates 1+2 at once: an Echo holds the first plate.
    const p1 = parsed.plates.find((p) => p.id === '1');
    const p2 = parsed.plates.find((p) => p.id === '2');
    if (p1) steps.push(['goto', p1.x, p1.y]);
    steps.push(['wait', 30]);
    steps.push(['reset']);
    if (p2) steps.push(['goto', p2.x, p2.y]);
    steps.push(['wait', 30]);
    for (const art of parsed.artifacts) steps.push(['goto', art.x, art.y]);
    steps.push(['goto', parsed.exit.x, parsed.exit.y]);
    const result = runSolution(world, def, steps);
    ok = result.ok;
    detail = ok ? `attempt ${attempt}, ${(result.ticks / 60).toFixed(1)}s` : `failed at ${JSON.stringify(result.at)}`;
  }
  check(`Endless room ${room} solvable`, ok, detail);
}

console.log(`\n${passed} passed, ${failed} failed${failures.length ? ` — failed: ${failures.join(', ')}` : ''}`);
process.exit(failed === 0 ? 0 : 1);
