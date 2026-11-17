// The game's rules and state, with no drawing and no browser in it: movement, crates,
// pressure plates and latching doors, lasers, drones, the Time Echo recording and replay,
// alarms, artifacts, the exit, medals. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about screens
// or sound. The module imports nothing browser-specific, so Node can drive it headlessly.
import { COLS, DRONE, MAX_RECORD_TICKS, PLAYER, ROWS, STEP } from './config.js';
import { DOOR_NEEDS } from './levels.js';

export const EVENT_PICKUP = 1;
export const EVENT_ALARM = 2;
export const EVENT_COMPLETE = 4;
export const EVENT_ECHO = 8;
export const EVENT_DOOR = 16;
export const EVENT_TIMEOUT = 32;
export const EVENT_RESET = 64;
export const EVENT_LASER_OFF = 128;

const DOOR_CHARS = new Set(['G', 'H', 'J', 'K', 'D']);
const PLATE_CHARS = new Set(['1', '2', '3', 'W']);
const LASER_CHARS = new Set(['-', '|', 't', 'T']);

function tileAt(grid, c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return '#';
  return grid[r][c];
}

function isSolidTile(ch, doorsOpen) {
  if (ch === '#') return true;
  if (DOOR_CHARS.has(ch)) return !doorsOpen;
  return false;
}

/** Parse a level definition into the live entities the simulation works with. */
export function parseLevel(def) {
  const grid = def.map.map((row) => row.split(''));
  const data = {
    def, grid, start: { x: 1.5, y: 1.5 }, exit: null,
    plates: [], switches: [], lasers: [], doors: [], drones: [], crates: [], artifacts: [],
  };
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const ch = grid[r][c];
      if (ch === 'P') data.start = { x: c + 0.5, y: r + 0.5 };
      else if (ch === 'X') data.exit = { x: c, y: r };
      else if (ch === 'A') data.artifacts.push({ x: c, y: r, taken: false });
      else if (PLATE_CHARS.has(ch)) data.plates.push({ id: ch, x: c, y: r, pressed: false });
      else if (ch === 's') data.switches.push({ x: c, y: r, pressed: false });
      else if (LASER_CHARS.has(ch)) {
        data.lasers.push({ x: c, y: r, kind: ch, vertical: ch === '|' || ch === 'T', timed: ch === 't' || ch === 'T' });
      } else if (DOOR_CHARS.has(ch)) {
        data.doors.push({ x: c, y: r, needs: DOOR_NEEDS[ch] || [], open: false });
      } else if (ch === 'o' || ch === 'O') {
        const vertical = ch === 'O';
        let min = vertical ? r : c;
        let max = min;
        if (vertical) {
          while (tileAt(grid, c, max + 1) !== '#') max += 1;
          while (tileAt(grid, c, min - 1) !== '#') min -= 1;
        } else {
          while (tileAt(grid, max + 1, r) !== '#') max += 1;
          while (tileAt(grid, min - 1, r) !== '#') min -= 1;
        }
        data.drones.push({
          x: c + 0.5, y: r + 0.5, vertical, min: min + 0.5, max: max + 0.5,
          dir: 1, speed: DRONE.speed, distracted: 0, targetX: c + 0.5, targetY: r + 0.5,
          homeX: c + 0.5, homeY: r + 0.5,
        });
      } else if (ch === 'C') data.crates.push({ x: c + 0.5, y: r + 0.5 });
    }
  }
  return data;
}

export function createWorld(random) {
  const state = {
    level: null, parsed: null, mode: 'story', room: 1,
    player: { x: 1.5, y: 1.5, faceX: 1, faceY: 0 },
    crates: [], drones: [], echoes: [], recording: [],
    time: 0, loopTime: 0, tick: 0,
    artifactsGot: 0, artifactsTotal: 0,
    alarms: 0, resets: 0, alarmCooldown: 0, alarmFlash: 0,
    complete: false, failed: false, failReason: '',
    doorsOpenCount: 0, lasersOff: false,
  };

  function loadLevel(def, mode = 'story', room = 1) {
    const parsed = parseLevel(def);
    state.level = def;
    state.parsed = parsed;
    state.mode = mode;
    state.room = room;
    state.player.x = parsed.start.x;
    state.player.y = parsed.start.y;
    state.player.faceX = 1;
    state.player.faceY = 0;
    state.crates = parsed.crates.map((c) => ({ x: c.x, y: c.y }));
    state.drones = parsed.drones.map((d) => ({ ...d }));
    state.echoes = [];
    state.recording = [];
    state.time = 0;
    state.loopTime = 0;
    state.tick = 0;
    state.artifactsGot = 0;
    state.artifactsTotal = parsed.artifacts.length;
    state.alarms = 0;
    state.resets = 0;
    state.alarmCooldown = 0;
    state.alarmFlash = 0;
    state.complete = false;
    state.failed = false;
    state.failReason = '';
    state.doorsOpenCount = 0;
    state.lasersOff = false;
    for (const a of parsed.artifacts) a.taken = false;
    for (const d of parsed.doors) d.open = false;
  }

  function doorOpenAt(c, r) {
    const parsed = state.parsed;
    for (const d of parsed.doors) if (d.x === c && d.y === r) return d.open;
    return false;
  }

  function solidAt(c, r) {
    const ch = tileAt(state.parsed.grid, c, r);
    if (DOOR_CHARS.has(ch)) return !doorOpenAt(c, r);
    return ch === '#';
  }

  /** True when the box centred at (x, y) with half-size `rad` overlaps a solid tile. */
  function hitsSolid(x, y, rad) {
    const c0 = Math.floor(x - rad);
    const c1 = Math.floor(x + rad);
    const r0 = Math.floor(y - rad);
    const r1 = Math.floor(y + rad);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (solidAt(c, r)) return true;
      }
    }
    return false;
  }

  function crateAtTile(c, r, except) {
    for (const crate of state.crates) {
      if (crate === except) continue;
      if (Math.floor(crate.x) === c && Math.floor(crate.y) === r) return crate;
    }
    return null;
  }

  function moveActor(actor, dx, dy, isPlayer) {
    // X axis, then Y axis, so the actor slides along walls instead of sticking.
    if (dx !== 0) {
      const nx = actor.x + dx;
      if (!hitsSolid(nx, actor.y, PLAYER.radius)) {
        const crate = crateAtTile(Math.floor(nx + Math.sign(dx) * PLAYER.radius), Math.floor(actor.y), null);
        if (crate && isPlayer) {
          // Push the crate one tile if the tile beyond it is free.
          const tc = Math.floor(crate.x);
          const tr = Math.floor(crate.y);
          const nc = tc + Math.sign(dx);
          if (!solidAt(nc, tr) && !crateAtTile(nc, tr, crate)) {
            crate.x = nc + 0.5;
            crate.y = tr + 0.5;
            actor.x = nx;
          }
        } else if (!crate) {
          actor.x = nx;
        }
      }
    }
    if (dy !== 0) {
      const ny = actor.y + dy;
      if (!hitsSolid(actor.x, ny, PLAYER.radius)) {
        const crate = crateAtTile(Math.floor(actor.x), Math.floor(ny + Math.sign(dy) * PLAYER.radius), null);
        if (crate && isPlayer) {
          const tc = Math.floor(crate.x);
          const tr = Math.floor(crate.y);
          const nr = tr + Math.sign(dy);
          if (!solidAt(tc, nr) && !crateAtTile(tc, nr, crate)) {
            crate.x = tc + 0.5;
            crate.y = nr + 0.5;
            actor.y = ny;
          }
        } else if (!crate) {
          actor.y = ny;
        }
      }
    }
  }

  function actorTile(actor) {
    return { c: Math.floor(actor.x), r: Math.floor(actor.y) };
  }

  function platePressed(plate) {
    const p = state.player;
    if (Math.floor(p.x) === plate.x && Math.floor(p.y) === plate.y) return true;
    for (const e of state.echoes) {
      if (Math.floor(e.x) === plate.x && Math.floor(e.y) === plate.y) return true;
    }
    for (const crate of state.crates) {
      if (Math.floor(crate.x) === plate.x && Math.floor(crate.y) === plate.y) return true;
    }
    return false;
  }

  function switchPressed(sw) {
    const p = state.player;
    if (Math.floor(p.x) === sw.x && Math.floor(p.y) === sw.y) return true;
    for (const e of state.echoes) {
      if (Math.floor(e.x) === sw.x && Math.floor(e.y) === sw.y) return true;
    }
    for (const crate of state.crates) {
      if (Math.floor(crate.x) === sw.x && Math.floor(crate.y) === sw.y) return true;
    }
    return false;
  }

  /** Is the timed laser at this tile lit right now? `t` and `T` blink in opposite phases. */
  function timedLaserOn(laser) {
    const phase = state.loopTime % 4;
    if (laser.kind === 't') return phase < 2;
    return phase >= 2;
  }

  function laserActive(laser) {
    if (state.lasersOff) return false;
    if (laser.timed) return timedLaserOn(laser);
    return true;
  }

  function hasLineOfSight(x0, y0, x1, y1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
    for (let i = 1; i < steps; i += 1) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (solidAt(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  function sees(drone, actor) {
    const dx = actor.x - drone.x;
    const dy = actor.y - drone.y;
    const dist = Math.hypot(dx, dy);
    if (dist > DRONE.range || dist < 0.01) return dist < 0.01;
    const fx = drone.vertical ? 0 : drone.dir;
    const fy = drone.vertical ? drone.dir : 0;
    const dot = (dx * fx + dy * fy) / dist;
    if (dot < Math.cos(DRONE.halfAngle)) return false;
    return hasLineOfSight(drone.x, drone.y, actor.x, actor.y);
  }

  function triggerAlarm(events) {
    if (state.alarmCooldown > 0) return events;
    state.alarms += 1;
    state.alarmCooldown = DRONE.alarmCooldown;
    state.alarmFlash = 0.6;
    state.player.x = state.parsed.start.x;
    state.player.y = state.parsed.start.y;
    return events | EVENT_ALARM;
  }

  /**
   * Turn the current recording into an Echo and start a fresh loop. The world resets
   * (drones and timed lasers back to their opening positions) but crates and latched
   * doors stay as they are — the loop rewinds people, not the museum.
   */
  function resetTimeline() {
    const def = state.level;
    const maxEchoes = def ? def.maxEchoes : 3;
    let events = EVENT_RESET;
    if (state.recording.length >= 12 && state.echoes.length < maxEchoes) {
      const frames = state.recording.slice();
      state.echoes.push({ frames, t: 0, done: false, x: frames[0].x, y: frames[0].y });
      events |= EVENT_ECHO;
    } else if (state.echoes.length >= maxEchoes) {
      // No room for another echo: the loop still rewinds, the recording is dropped.
    }
    state.recording = [];
    state.loopTime = 0;
    state.resets += 1;
    state.player.x = state.parsed.start.x;
    state.player.y = state.parsed.start.y;
    for (const d of state.drones) {
      d.x = d.homeX;
      d.y = d.homeY;
      d.dir = 1;
      d.distracted = 0;
    }
    return events;
  }

  /**
   * One fixed step. `input` is { mx, my, reset } — mx/my in [-1, 1], reset an edge
   * (true only on the tick the key was pressed). Returns event bit flags.
   */
  function step(dt, input) {
    let events = 0;
    if (state.complete || state.failed || !state.parsed) return events;
    state.time += dt;
    state.loopTime += dt;
    state.tick += 1;
    if (state.alarmCooldown > 0) state.alarmCooldown -= dt;
    if (state.alarmFlash > 0) state.alarmFlash -= dt;
    if (state.time > state.level.timeLimit) {
      state.failed = true;
      state.failReason = 'Time ran out.';
      return EVENT_TIMEOUT;
    }

    if (input.reset) {
      events |= resetTimeline();
      if (state.recording.length === 0 && state.echoes.length > 0) {
        // resetTimeline already handled the echo; nothing else to do this tick.
      }
    }

    // --- player movement ---
    const mx = input.mx || 0;
    const my = input.my || 0;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      const nx = (mx / len) * PLAYER.speed * dt;
      const ny = (my / len) * PLAYER.speed * dt;
      moveActor(state.player, nx, ny, true);
      state.player.faceX = mx / len;
      state.player.faceY = my / len;
    }

    // --- echoes replay their recordings, then freeze at their final spot ---
    for (const echo of state.echoes) {
      if (echo.done) continue;
      echo.t += 1;
      if (echo.t >= echo.frames.length) {
        echo.done = true;
        const last = echo.frames[echo.frames.length - 1];
        echo.x = last.x;
        echo.y = last.y;
      } else {
        echo.x = echo.frames[echo.t].x;
        echo.y = echo.frames[echo.t].y;
      }
    }

    // --- plates, switches, latching doors ---
    for (const plate of state.parsed.plates) plate.pressed = platePressed(plate);
    let anySwitch = false;
    for (const sw of state.parsed.switches) {
      sw.pressed = switchPressed(sw);
      if (sw.pressed) anySwitch = true;
    }
    const wasOff = state.lasersOff;
    state.lasersOff = anySwitch;
    if (state.lasersOff && !wasOff) events |= EVENT_LASER_OFF;
    for (const door of state.parsed.doors) {
      if (door.open) continue;
      const held = door.needs.every((id) => {
        const plate = state.parsed.plates.find((p) => p.id === id);
        return plate && plate.pressed;
      });
      if (held) {
        door.open = true;
        state.doorsOpenCount += 1;
        events |= EVENT_DOOR;
      }
    }

    // --- drones: patrol, spot the player, get distracted by echoes ---
    for (const drone of state.drones) {
      if (drone.distracted > 0) {
        drone.distracted -= dt;
        const dx = drone.targetX - drone.x;
        const dy = drone.targetY - drone.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.05) {
          const sp = DRONE.speed * 1.4 * dt;
          drone.x += (dx / dist) * Math.min(sp, dist);
          drone.y += (dy / dist) * Math.min(sp, dist);
        }
        continue;
      }
      // Chase the nearest visible echo instead of patrolling.
      let seenEcho = null;
      for (const echo of state.echoes) {
        if (sees(drone, echo)) { seenEcho = echo; break; }
      }
      if (seenEcho) {
        drone.distracted = DRONE.distractSeconds;
        drone.targetX = seenEcho.x;
        drone.targetY = seenEcho.y;
        continue;
      }
      if (drone.vertical) {
        drone.y += drone.dir * drone.speed * dt;
        if (drone.y >= drone.max) { drone.y = drone.max; drone.dir = -1; }
        else if (drone.y <= drone.min) { drone.y = drone.min; drone.dir = 1; }
      } else {
        drone.x += drone.dir * drone.speed * dt;
        if (drone.x >= drone.max) { drone.x = drone.max; drone.dir = -1; }
        else if (drone.x <= drone.min) { drone.x = drone.min; drone.dir = 1; }
      }
      if (sees(drone, state.player)) events = triggerAlarm(events);
      const ddx = state.player.x - drone.x;
      const ddy = state.player.y - drone.y;
      if (Math.hypot(ddx, ddy) < 0.5) events = triggerAlarm(events);
    }

    // --- lasers burn the player (echoes are ghosts and pass through) ---
    const pt = actorTile(state.player);
    for (const laser of state.parsed.lasers) {
      if (laser.x === pt.c && laser.y === pt.r && laserActive(laser)) {
        events = triggerAlarm(events);
        break;
      }
    }

    // --- artifacts and the exit ---
    for (const art of state.parsed.artifacts) {
      if (art.taken) continue;
      if (Math.floor(state.player.x) === art.x && Math.floor(state.player.y) === art.y) {
        art.taken = true;
        state.artifactsGot += 1;
        events |= EVENT_PICKUP;
      }
    }
    if (state.artifactsGot >= state.artifactsTotal && state.parsed.exit) {
      if (pt.c === state.parsed.exit.x && pt.r === state.parsed.exit.y) {
        state.complete = true;
        events |= EVENT_COMPLETE;
      }
    }

    // --- record this tick for the next echo ---
    state.recording.push({ x: state.player.x, y: state.player.y });
    if (state.recording.length > MAX_RECORD_TICKS) {
      events |= resetTimeline();
    }
    return events;
  }

  /** Medal for a finished level: Perfect Echo, Gold, Silver or Bronze. */
  function medalFor(level, time, resets, alarms) {
    if (time <= level.par && resets <= level.perfectResets && alarms === 0) return 'Perfect Echo';
    if (time <= level.par * 1.5 && alarms <= 1) return 'Gold';
    if (time <= level.par * 2.5 && alarms <= 3) return 'Silver';
    return 'Bronze';
  }

  function scoreFor(level, time, resets, alarms, medal) {
    const base = 1000;
    const timeBonus = Math.max(0, Math.round((level.par * 2 - time) * 10));
    const resetPenalty = resets * 50;
    const alarmPenalty = alarms * 100;
    const medalBonus = medal === 'Perfect Echo' ? 500 : medal === 'Gold' ? 300 : medal === 'Silver' ? 150 : 0;
    return Math.max(100, base + timeBonus + medalBonus - resetPenalty - alarmPenalty);
  }

  return { state, loadLevel, step, resetTimeline, medalFor, scoreFor, timedLaserOn };
}
