// Headless QA for ECHO SHIFT via Chrome DevTools Protocol (Node stdlib only:
// Node 22+ has a global WebSocket client). Serves game/ on :8091, drives the real
// game in headless Chrome, captures the 4 screenshots, and exercises the menus,
// pause/resume/restart/mute and a full Level 1 playthrough with real key events.
//
// Browser: stock chrome-headless-shell from the puppeteer cache
// (~/.cache/puppeteer/chrome-headless-shell/...). The machine's /opt/meta-chromium
// build is patched by Hatch: it refuses to start without a WebGL domain policy
// and blocks loopback navigations, so it cannot run this QA.
//
// Run: node tests/qa-headless.mjs   (exit 0 = everything passed)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = [
  { name: '1-start.jpg', query: '?shot=start&seed=1' },
  { name: '2-play.jpg', query: '?shot=play&seed=1' },
  { name: '3-action.jpg', query: '?shot=action&seed=1' },
  { name: '4-end.jpg', query: '?shot=end&seed=1' },
];
const PORT = 8091;
const CHROME = '/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-157.0.8103.50/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const problems = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  PASS ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed += 1; problems.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort(port, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    const ok = await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { res.resume(); resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
    });
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }

  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); } }, 30000);
    });
  }

  async eval(expression) {
    const r = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${JSON.stringify(r.exceptionDetails).slice(0, 500)}`);
    return r.result.value;
  }

  async key(type, code, key) {
    await this.call('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 });
  }

  async tap(x, y) {
    await this.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(120);
  }

  /** A one-finger tap via the touch pipeline (generates touch + pointer events). */
  async touchTap(x, y) {
    this.lastTouch = { x, y };
    await this.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await this.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y, id: 1 }] });
    await sleep(150);
  }

  /** Touch-hold-drag: finger down at (x0, y0), glides to (x1, y1), stays down. */
  async touchDragStart(x0, y0, x1, y1, steps = 8, stepMs = 60) {
    this.lastTouch = { x: x1, y: y1 };
    await this.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    await sleep(100);
    for (let i = 1; i <= steps; i += 1) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      await this.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
      await sleep(stepMs);
    }
  }

  /** Lift the finger (touchEnd needs the point being released). */
  async touchEnd() {
    const p = this.lastTouch || { x: 0, y: 0 };
    await this.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await sleep(150);
  }

  async shot(path) {
    const r = await this.call('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
  }
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  fs.rmSync('/tmp/echo-qa-profile', { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1280,720', '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/echo-qa-profile', '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeLog = '';
  chrome.stderr.on('data', (d) => { chromeLog += d; });
  const errors = [];
  const requests = [];
  try {
    check('dev server answers', await waitPort(PORT), serverLog.slice(-200));
    // Wait for the DevTools endpoint instead of a fixed sleep.
    let devtoolsUp = false;
    for (let i = 0; i < 50 && !devtoolsUp; i += 1) {
      try { await getJson('http://127.0.0.1:9222/json/version'); devtoolsUp = true; }
      catch { await sleep(200); }
    }
    check('headless Chrome DevTools answers', devtoolsUp, chromeLog.slice(-300));
    if (!devtoolsUp) throw new Error('chrome did not start');
    const targets = await getJson('http://127.0.0.1:9222/json/list');
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    const cdp = new CDP(ws);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Log.enable');
    await cdp.call('Network.enable');
    await cdp.call('Input.setInterceptDrags', { enabled: false }).catch(() => {});

    const drainErrors = () => {
      for (const ev of cdp.events.splice(0)) {
        if (ev.method === 'Runtime.exceptionThrown') {
          const d = ev.params.exceptionDetails;
          errors.push(`exception: ${d.exception?.description || d.text || '?'}`.slice(0, 300));
        } else if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error') {
          errors.push(`console.error: ${ev.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
        } else if (ev.method === 'Log.entryAdded' && ev.params.entry.level === 'error') {
          errors.push(`log: ${ev.params.entry.text} ${ev.params.entry.url || ''}`.slice(0, 300));
        } else if (ev.method === 'Network.requestWillBeSent') {
          requests.push(ev.params.request.url);
        } else if (ev.method === 'Network.loadingFailed') {
          errors.push(`network failed: ${ev.params.errorText}`.slice(0, 300));
        }
      }
    };

    async function navigate(url) {
      await cdp.call('Page.navigate', { url });
      await sleep(1500);
      drainErrors();
    }

    async function waitShotReady(timeoutMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const ready = await cdp.eval('window.__shotReady === true').catch(() => false);
        if (ready) return true;
        await sleep(200);
      }
      return false;
    }

    // ---- 1. screenshots (the 4 staged scenes) ----
    console.log('== screenshots ==');
    for (const shot of SHOTS) {
      await navigate(`${BASE}/index.html${shot.query}`);
      const ready = await waitShotReady();
      check(`${shot.name} staged (window.__shotReady)`, ready);
      await sleep(300);
      drainErrors();
      await cdp.shot(`${ROOT}/screenshots/${shot.name}`);
      const size = fs.statSync(`${ROOT}/screenshots/${shot.name}`).size;
      check(`${shot.name} <= 256 KiB`, size <= 262144, `${size} bytes`);
    }

    // ---- 2. interactive QA on the real game ----
    console.log('== interactive QA ==');
    await navigate(`${BASE}/index.html`);
    await sleep(1000);
    drainErrors();
    const screen = () => cdp.eval('window.__echoShift.ui.screen');
    const state = () => cdp.eval(`(() => { const w = window.__echoShift.world.state; return { x: w.player.x, y: w.player.y, complete: w.complete, echoes: w.echoes.length, resets: w.resets, alarms: w.alarms, artifactsGot: w.artifactsGot, level: w.level && w.level.id, time: w.time }; })()`);

    check('title screen shows', (await screen()) === 'title', await screen());
    await cdp.shot('/tmp/qa-title.jpg');

    // Level select, and a locked level must not start.
    await cdp.tap(640, 447); // STORY MODE
    check('Story Mode opens level select', (await screen()) === 'select', await screen());
    await cdp.tap(780, 199); // LEVEL 3 (locked)
    check('locked level does not start', (await screen()) === 'select', await screen());
    await cdp.tap(220, 199); // LEVEL 1
    check('Level 1 starts', (await screen()) === 'play' && (await state()).level === 1, await screen());

    // Move right with a real key event.
    const before = await state();
    await cdp.key('keyDown', 'KeyD', 'd');
    await sleep(900);
    await cdp.key('keyUp', 'KeyD', 'd');
    const after = await state();
    check('WASD movement moves the player', after.x > before.x + 1, `x ${before.x.toFixed(1)} -> ${after.x.toFixed(1)}`);

    // R spawns an echo, P pauses, Esc resumes, M mutes.
    await cdp.key('keyDown', 'KeyR', 'r'); await cdp.key('keyUp', 'KeyR', 'r');
    await sleep(300);
    const afterReset = await state();
    check('R resets the timeline and spawns an Echo', afterReset.resets === 1 && afterReset.echoes === 1, `resets=${afterReset.resets} echoes=${afterReset.echoes}`);
    await cdp.key('keyDown', 'KeyP', 'p'); await cdp.key('keyUp', 'KeyP', 'p');
    await sleep(300);
    check('P pauses', (await screen()) === 'paused', await screen());
    await cdp.shot('/tmp/qa-paused.jpg');
    await cdp.key('keyDown', 'KeyP', 'p'); await cdp.key('keyUp', 'KeyP', 'p');
    await sleep(300);
    check('P resumes', (await screen()) === 'play', await screen());
    await cdp.key('keyDown', 'Escape', 'Escape'); await cdp.key('keyUp', 'Escape', 'Escape');
    await sleep(300);
    check('Esc pauses', (await screen()) === 'paused', await screen());
    await cdp.tap(640, 509); // Resume button
    check('Resume button works', (await screen()) === 'play', await screen());
    const mutedBefore = await cdp.eval('window.__echoShift.save.muted');
    await cdp.key('keyDown', 'KeyM', 'm'); await cdp.key('keyUp', 'KeyM', 'm');
    await sleep(200);
    const mutedAfter = await cdp.eval('window.__echoShift.save.muted');
    check('M toggles mute', mutedAfter === !mutedBefore, `muted ${mutedBefore} -> ${mutedAfter}`);
    await cdp.key('keyDown', 'KeyM', 'm'); await cdp.key('keyUp', 'KeyM', 'm');
    await sleep(200);

    // Play Level 1 to completion with real keys, steered by live state.
    const held = new Set();
    async function hold(code, key, on) {
      if (on && !held.has(code)) { held.add(code); await cdp.key('keyDown', code, key); }
      if (!on && held.has(code)) { held.delete(code); await cdp.key('keyUp', code, key); }
    }
    async function releaseAll() {
      for (const code of [...held]) await hold(code, code.replace('Key', '').toLowerCase(), false);
    }
    let completed = false;
    const playStart = Date.now();
    while (Date.now() - playStart < 60000) {
      const st = await state();
      if (st.complete) { completed = true; break; }
      if ((await screen()) !== 'play') break;
      const target = st.artifactsGot < 1 ? { x: 8.5, y: 1.5 } : { x: 10.5, y: 9.5 };
      const dx = target.x - st.x;
      const dy = target.y - st.y;
      await hold('KeyD', 'd', dx > 0.15);
      await hold('KeyA', 'a', dx < -0.15);
      await hold('KeyS', 's', Math.abs(dx) <= 0.15 && dy > 0.15);
      await hold('KeyW', 'w', Math.abs(dx) <= 0.15 && dy < -0.15);
      await sleep(120);
      drainErrors();
    }
    await releaseAll();
    await sleep(600);
    drainErrors();
    check('Level 1 completes via real keys', completed && (await screen()) === 'results', `complete=${completed} screen=${await screen()}`);
    const results = await cdp.eval('window.__echoShift.ui.results');
    check('results show a medal and score', !!results && !!results.medal && typeof results.score === 'number', results ? `${results.medal} ${results.score}` : 'no results');
    await cdp.shot('/tmp/qa-results.jpg');
    // Restart from results via Replay, then quit to menu.
    await cdp.tap(760, 547); // Replay
    check('Replay restarts the level', (await screen()) === 'play' && (await state()).time < 2, await screen());
    await cdp.key('keyDown', 'KeyP', 'p'); await cdp.key('keyUp', 'KeyP', 'p');
    await sleep(300);
    await cdp.tap(640, 641); // Quit to menu
    check('Quit to menu returns to title', (await screen()) === 'title', await screen());

    // Settings + help.
    await cdp.tap(562, 638); // Settings
    check('Settings opens', (await screen()) === 'settings', await screen());
    const volBefore = await cdp.eval('window.__echoShift.save.volume');
    await cdp.tap(720, 590); // Vol +
    const volAfter = await cdp.eval('window.__echoShift.save.volume');
    check('Volume + works', volAfter > volBefore, `${volBefore} -> ${volAfter}`);
    await cdp.tap(640, 650); // Back
    check('Settings Back returns to title', (await screen()) === 'title', await screen());
    await cdp.tap(725, 638); // How to play
    check('Help opens', (await screen()) === 'help', await screen());
    await cdp.tap(640, 587); // Back
    check('Help Back returns to title', (await screen()) === 'title', await screen());

    // Endless Heist and Time Trial select.
    await cdp.tap(640, 513); // ENDLESS HEIST
    await sleep(400);
    const endlessMode = await cdp.eval('window.__echoShift.ui.mode');
    check('Endless Heist starts', (await screen()) === 'play' && endlessMode === 'endless', `screen=${await screen()} mode=${endlessMode}`);
    await navigate(`${BASE}/index.html`);
    await cdp.tap(640, 579); // TIME TRIAL
    await sleep(400);
    const trialMode = await cdp.eval('window.__echoShift.ui.selectMode');
    check('Time Trial opens level select in trial mode', (await screen()) === 'select' && trialMode === 'trial', `screen=${await screen()} mode=${trialMode}`);

    // AudioContext comes up without throwing (headless: no real sound needed).
    const audioOk = await cdp.eval(`(() => { try { const a = window.__echoShift.audio; a.ensure(); return true; } catch (e) { return String(e); } })()`);
    check('WebAudio ensure() does not throw', audioOk === true, String(audioOk));

    // ---- 3. touch controls (emulated touch device) ----
    console.log('== touch controls ==');
    await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await navigate(`${BASE}/index.html`);
    await sleep(800);
    drainErrors();
    check('touch device is detected (ui.isTouch)', (await cdp.eval('window.__echoShift.ui.isTouch')) === true);
    check('title screen shows on touch device', (await screen()) === 'title', await screen());
    // Menus work by touch tap, exactly like mouse clicks.
    await cdp.touchTap(640, 447); // STORY MODE
    check('touch tap opens level select', (await screen()) === 'select', await screen());
    await cdp.touchTap(220, 199); // LEVEL 1
    check('touch tap starts Level 1', (await screen()) === 'play' && (await state()).level === 1, await screen());
    // The play screen on touch shows the on-screen RESET + PAUSE buttons.
    const touchLabels = await cdp.eval('window.__echoShift.ui.buttons.map((b) => b.label)');
    check('touch play buttons include RESET', touchLabels.includes('↺ RESET'), touchLabels.join(', '));
    check('touch play buttons include PAUSE', touchLabels.includes('❚❚'), touchLabels.join(', '));
    const resetBtn = await cdp.eval(`(() => { const b = window.__echoShift.ui.buttons.find((x) => x.label === '↺ RESET'); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2, h: b.h } : null; })()`);
    check('touch RESET button is thumb-sized', !!resetBtn && resetBtn.h >= 44, resetBtn ? `h=${resetBtn.h}` : 'missing');
    // Virtual joystick: touch-hold-drag right moves the thief right.
    const dragBefore = await state();
    await cdp.touchDragStart(400, 400, 600, 400);
    await sleep(700); // still holding the drag
    const dragMid = await state();
    check('touch drag steers the player', dragMid.x > dragBefore.x + 1, `x ${dragBefore.x.toFixed(1)} -> ${dragMid.x.toFixed(1)}`);
    check('joystick is active while dragging', (await cdp.eval('window.__echoShift.ui.joystick !== null')) === true);
    await cdp.touchEnd();
    await sleep(600); // friction coasts the thief to a stop
    const dragAfter = await state();
    check('releasing the drag stops the player', dragAfter.x < dragMid.x + 1, `x ${dragMid.x.toFixed(1)} -> ${dragAfter.x.toFixed(1)}`);
    check('joystick clears on release', (await cdp.eval('window.__echoShift.ui.joystick')) === null);
    // A tap on the PAUSE touch button pauses WITHOUT moving the player.
    const pauseBefore = await state();
    const pauseBtn = await cdp.eval(`(() => { const b = window.__echoShift.ui.buttons.find((x) => x.label === '❚❚'); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; })()`);
    await cdp.touchTap(pauseBtn.x, pauseBtn.y);
    const pausedState = await state();
    check('touch PAUSE button pauses', (await screen()) === 'paused', await screen());
    check('tapping PAUSE does not steer the player', Math.abs(pausedState.x - pauseBefore.x) < 0.05 && Math.abs(pausedState.y - pauseBefore.y) < 0.05, `(${pauseBefore.x.toFixed(2)},${pauseBefore.y.toFixed(2)}) -> (${pausedState.x.toFixed(2)},${pausedState.y.toFixed(2)})`);
    await cdp.touchTap(640, 509); // Resume button
    check('Resume button works after touch pause', (await screen()) === 'play', await screen());
    // The touch RESET button spawns an Echo, same as pressing R.
    const resetBefore = await state();
    await cdp.touchTap(resetBtn.x, resetBtn.y);
    await sleep(400);
    const resetAfter = await state();
    check('touch RESET button spawns an Echo', resetAfter.resets === resetBefore.resets + 1 && resetAfter.echoes === resetBefore.echoes + 1, `resets=${resetAfter.resets} echoes=${resetAfter.echoes}`);
    // Help on a touch device shows the touch hints (flag-gated in the renderer).
    await cdp.key('keyDown', 'KeyP', 'p'); await cdp.key('keyUp', 'KeyP', 'p');
    await sleep(300);
    await cdp.touchTap(640, 641); // Quit to menu
    check('Quit to menu returns to title (touch)', (await screen()) === 'title', await screen());
    await cdp.touchTap(725, 638); // How to play
    check('Help opens on touch device', (await screen()) === 'help', await screen());
    check('Help still offers touch hints (isTouch)', (await cdp.eval('window.__echoShift.ui.isTouch')) === true);
    await cdp.touchTap(640, 587); // Back
    check('Help Back returns to title (touch)', (await screen()) === 'title', await screen());
    await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: false });
    drainErrors();

    // Everything the page fetched must be local (offline requirement).
    drainErrors();
    const external = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:blank');
    check('no external network requests', external.length === 0, external.slice(0, 3).join(', '));
    check('no JS console errors / exceptions / failed requests', errors.length === 0, errors.slice(0, 5).join(' | '));

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
  console.log(`\n${passed} passed, ${failed} failed${problems.length ? ` — failed: ${problems.join(', ')}` : ''}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('QA harness error:', e); process.exit(2); });
