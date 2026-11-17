// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. Screens: title, level select, settings,
// help, play, paused, results, gallery. Progress (unlocked levels, medals, best times,
// endless best + top-5 scores, trial ghosts, mute/volume) lives in localStorage under
// SAVE_KEY.
//
// ?seed=N fixes Endless Heist generation. ?shot=start|play|action|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { FIELD, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { LEVELS, generateEndlessRoom } from './levels.js';
import {
  EVENT_ALARM, EVENT_COMPLETE, EVENT_DOOR, EVENT_ECHO, EVENT_LASER_OFF,
  EVENT_PICKUP, EVENT_PLATE, EVENT_TIMEOUT, createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESET, createInput, isTouchDevice } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_GALLERY, SCREEN_HELP, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_RESULTS, SCREEN_SELECT,
  SCREEN_SETTINGS, SCREEN_TITLE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// QA/debug handle (read-only state for headless checks): does not affect gameplay.
window.__echoShift = { world, audio };

function defaultSave() {
  return {
    unlocked: 1, best: {}, endlessBest: 0, endlessScores: [], trialBest: {},
    trialGhost: {}, muted: false, volume: 0.7,
  };
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

const save = readSave();
audio.setMuted(save.muted);
audio.setVolume(save.volume);

const ui = {
  screen: SCREEN_TITLE,
  buttons: [],
  mode: 'story',
  selectMode: 'story',
  levelIndex: 0,
  endlessRoom: 1,
  results: null,
  resultsAt: 0,
  message: '',
  messageUntil: 0,
  save,
  muted: save.muted,
  volume: save.volume,
  levels: LEVELS,
  hint: '',
  trialGhost: null,
  trialTrace: [],
  nameEntry: null,
  pendingScore: null,
  suppressConfirm: false,
  lastTensionSent: 0,
  // Touch devices get on-screen RESET / PAUSE buttons and touch hints in Help;
  // the desktop UI is built from this flag and stays exactly as it was.
  isTouch: isTouchDevice(),
  joystick: null,
};
window.__echoShift.ui = ui;
window.__echoShift.save = save;

function setMessage(text, seconds = 3) {
  ui.message = text;
  ui.messageUntil = performance.now() + seconds * 1000;
}

function button(x, y, w, h, label, sub, action, opts = {}) {
  return { x, y, w, h, label, sub: sub || '', action, disabled: !!opts.disabled, accent: opts.accent || '' };
}

function titleButtons() {
  return [
    button(490, 420, 300, 54, '▶  STORY MODE', '12 handcrafted levels', () => showSelect('story')),
    button(490, 486, 300, 54, 'ENDLESS HEIST', 'Procedural rooms, best room ' + (save.endlessBest || 0), () => startEndless(1)),
    button(490, 552, 300, 54, 'TIME TRIAL', 'Race your best times', () => showSelect('trial')),
    button(490, 618, 145, 40, 'Settings', '', () => showSettings()),
    button(650, 618, 145, 40, 'How to play', '', () => showHelp()),
    button(810, 618, 145, 40, '🏛 Gallery', '', () => showGallery()),
  ];
}

function selectButtons() {
  const buttons = [];
  LEVELS.forEach((level, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 90 + col * 280;
    const y = 160 + row * 98;
    const locked = i + 1 > save.unlocked;
    const best = save.best[level.id];
    const sub = locked ? '🔒 locked' : best ? `${level.name} · ${best.medal}` : level.name;
    buttons.push(button(x, y, 260, 78, locked ? `LEVEL ${level.id} 🔒` : `LEVEL ${level.id}`, sub, () => {
      if (!locked) startLevel(i, ui.selectMode);
    }, { disabled: locked }));
  });
  buttons.push(button(90, 470, 260, 54, 'Endless Heist', 'procedural rooms', () => startEndless(1)));
  buttons.push(button(370, 470, 260, 54, ui.selectMode === 'trial' ? 'Story levels' : 'Time Trial', 'switch mode', () => showSelect(ui.selectMode === 'trial' ? 'story' : 'trial')));
  buttons.push(button(650, 470, 260, 54, 'Settings', '', () => showSettings()));
  buttons.push(button(930, 470, 260, 54, '← Back', '', () => showTitle()));
  return buttons;
}

function settingsButtons() {
  return [
    button(490, 500, 300, 54, save.muted ? '🔇 Sound: OFF' : '🔊 Sound: ON', 'press M to toggle', () => toggleMute()),
    button(490, 566, 140, 48, 'Vol −', '', () => setVolume(save.volume - 0.1)),
    button(650, 566, 140, 48, 'Vol +', '', () => setVolume(save.volume + 0.1)),
    button(490, 626, 300, 48, '← Back', '', () => showTitle()),
  ];
}

function helpButtons() {
  return [button(490, 560, 300, 54, '← Back', '', () => showTitle())];
}

function galleryButtons() {
  return [button(490, 600, 300, 54, '← Back', '', () => showTitle())];
}

function playButtons() {
  // Touch devices get bigger, thumb-sized buttons plus an on-screen RESET
  // (same as pressing R: rewind the timeline and spawn the Echo). Desktop
  // keeps the two small corner buttons, byte for byte as before.
  if (ui.isTouch) {
    return [
      button(996, 4, 110, 44, '↺ RESET', '', () => { ui.resetQueued = true; audio.reset(); }),
      button(1116, 4, 62, 44, '❚❚', '', () => pauseGame()),
      button(1188, 4, 62, 44, save.muted ? '🔇' : '♪', '', () => toggleMute()),
    ];
  }
  return [
    button(1120, 4, 62, 32, '❚❚', '', () => pauseGame()),
    button(1188, 4, 62, 32, save.muted ? '🔇' : '♪', '', () => toggleMute()),
  ];
}

function pausedButtons() {
  return [
    button(490, 482, 300, 54, 'Resume', 'P or Esc', () => resumeGame()),
    button(490, 548, 300, 54, 'Restart level', '', () => restartLevel()),
    button(490, 614, 300, 54, 'Quit to menu', '', () => showTitle()),
  ];
}

function resultsButtons() {
  const r = ui.results;
  const buttons = [];
  // Leaving the results screen saves a pending Endless record under a default
  // name when the player never typed initials.
  const leave = (fn) => () => { savePendingScore('YOU'); fn(); };
  if (r && r.nextAction) buttons.push(button(440, 520, 200, 54, r.nextLabel, '', leave(r.nextAction)));
  if (r) buttons.push(button(660, 520, 200, 54, 'Replay', '', leave(() => replayLevel())));
  buttons.push(button(550, 590, 200, 48, 'Level select', '', leave(() => showSelect(ui.mode === 'trial' ? 'trial' : 'story'))));
  return buttons;
}

function showTitle() {
  ui.screen = SCREEN_TITLE;
  ui.buttons = titleButtons();
  ui.results = null;
  ui.hint = '';
  announce('Echo Shift. Story mode, Endless Heist, or Time Trial.');
}

function showSelect(mode) {
  ui.selectMode = mode;
  ui.screen = SCREEN_SELECT;
  ui.buttons = selectButtons();
  ui.hint = '';
  announce(mode === 'trial' ? 'Time Trial level select.' : 'Level select.');
}

function showSettings() {
  ui.screen = SCREEN_SETTINGS;
  ui.buttons = settingsButtons();
}

function showHelp() {
  ui.screen = SCREEN_HELP;
  ui.buttons = helpButtons();
}

function showGallery() {
  ui.screen = SCREEN_GALLERY;
  ui.buttons = galleryButtons();
  announce('The Museum Gallery. Every artifact you steal hangs here.');
}

function startLevel(index, mode) {
  const level = LEVELS[index];
  ui.mode = mode;
  ui.levelIndex = index;
  world.loadLevel(level, mode);
  ui.screen = SCREEN_PLAY;
  ui.buttons = playButtons();
  ui.results = null;
  ui.hint = '';
  ui.nameEntry = null;
  ui.pendingScore = null;
  ui.trialTrace = [];
  ui.trialGhost = mode === 'trial' ? (save.trialGhost[level.id] || null) : null;
  audio.ensure();
  announce(`${level.name}. ${level.intro}`);
  setMessage(level.intro, 4);
}

function startEndless(room) {
  ui.mode = 'endless';
  ui.endlessRoom = room;
  const def = generateEndlessRoom(createRandom(seed + room * 7919), room);
  world.loadLevel(def, 'endless', room);
  ui.screen = SCREEN_PLAY;
  ui.buttons = playButtons();
  ui.results = null;
  ui.hint = '';
  ui.nameEntry = null;
  ui.pendingScore = null;
  ui.trialGhost = null;
  ui.trialTrace = [];
  audio.ensure();
  announce(`Endless Heist, room ${room}.`);
  setMessage(def.intro, 4);
}

function pauseGame() {
  if (ui.screen !== SCREEN_PLAY) return;
  ui.screen = SCREEN_PAUSED;
  ui.buttons = pausedButtons();
  announce('Paused.');
}

function resumeGame() {
  if (ui.screen !== SCREEN_PAUSED) return;
  ui.screen = SCREEN_PLAY;
  ui.buttons = playButtons();
  announce('Playing.');
}

function restartLevel() {
  if (ui.mode === 'endless') startEndless(ui.endlessRoom);
  else startLevel(ui.levelIndex, ui.mode);
}

function replayLevel() {
  restartLevel();
}

function toggleMute() {
  save.muted = !save.muted;
  audio.setMuted(save.muted);
  ui.muted = save.muted;
  writeSave(save);
  if (ui.screen === SCREEN_SETTINGS) ui.buttons = settingsButtons();
  if (ui.screen === SCREEN_PLAY) ui.buttons = playButtons();
}

function setVolume(value) {
  save.volume = Math.max(0, Math.min(1, Math.round(value * 10) / 10));
  audio.setVolume(save.volume);
  ui.volume = save.volume;
  writeSave(save);
  if (ui.screen === SCREEN_SETTINGS) ui.buttons = settingsButtons();
}

/** Save a pending Endless record (typed initials, or a default name). */
function savePendingScore(name) {
  if (!ui.pendingScore) return;
  const entry = {
    name: (name || 'ACE').toUpperCase().slice(0, 3) || 'ACE',
    room: ui.pendingScore.room,
    score: ui.pendingScore.score,
  };
  save.endlessScores = save.endlessScores || [];
  save.endlessScores.push(entry);
  save.endlessScores.sort((a, b) => b.room - a.room || b.score - a.score);
  save.endlessScores = save.endlessScores.slice(0, 5);
  writeSave(save);
  ui.pendingScore = null;
  ui.nameEntry = null;
}

function finishLevel() {
  const st = world.state;
  const level = st.level;
  const medal = world.medalFor(level, st.time, st.resets, st.alarms);
  const breakdown = world.scoreBreakdown(level, st.time, st.resets, st.alarms, medal);
  const score = breakdown.total;
  let isNewBest = false;
  let bestLine = '';
  let nextAction = null;
  let nextLabel = '';
  if (ui.mode === 'story') {
    const prev = save.best[level.id];
    if (!prev || score > prev.score) {
      save.best[level.id] = { time: Math.round(st.time * 10) / 10, medal, score };
      isNewBest = true;
    }
    if (level.id === save.unlocked && level.id < LEVELS.length) save.unlocked = level.id + 1;
    writeSave(save);
    const next = LEVELS[level.id];
    if (next) {
      nextLabel = `Next: ${next.name}`;
      nextAction = () => startLevel(level.id, 'story');
    }
    bestLine = prev && !isNewBest ? `Best: ${prev.medal} · ${prev.score} pts` : '';
  } else if (ui.mode === 'trial') {
    const prev = save.trialBest[level.id];
    if (!prev || st.time < prev.time) {
      save.trialBest[level.id] = { time: Math.round(st.time * 10) / 10 };
      isNewBest = true;
      // Keep the winning run as a ghost the player races next time (brief E).
      const trace = [];
      for (let i = 0; i < ui.trialTrace.length; i += 3) trace.push(ui.trialTrace[i]);
      save.trialGhost[level.id] = trace.slice(0, 1200);
    }
    writeSave(save);
    bestLine = `Best time: ${save.trialBest[level.id].time}s`;
  } else if (ui.mode === 'endless') {
    if (ui.endlessRoom > save.endlessBest) {
      save.endlessBest = ui.endlessRoom;
      isNewBest = true;
      // A new best room earns a Hall of Fame entry with typed initials.
      ui.pendingScore = { room: ui.endlessRoom, score };
      ui.nameEntry = { active: true, text: '', room: ui.endlessRoom };
    }
    writeSave(save);
    nextLabel = `Next room ${ui.endlessRoom + 1}`;
    nextAction = () => startEndless(ui.endlessRoom + 1);
    bestLine = `Best room: ${save.endlessBest}`;
  }
  audio.win();
  if (medal === 'Perfect Echo') audio.perfect();
  renderer.confetti();
  ui.results = {
    medal, time: st.time, resets: st.resets, alarms: st.alarms, score, breakdown,
    levelName: ui.mode === 'endless' ? `Heist Room ${ui.endlessRoom}` : level.name,
    par: ui.mode === 'endless' ? null : level.par,
    artifactsGot: st.artifactsGot, artifactsTotal: st.artifactsTotal,
    isNewBest, bestLine, nextAction, nextLabel,
  };
  ui.resultsAt = performance.now();
  ui.screen = SCREEN_RESULTS;
  ui.buttons = resultsButtons();
  announce(`Level complete. ${medal}. Score ${score}.`);
}

function failLevel(reason) {
  const st = world.state;
  audio.fail();
  ui.results = {
    medal: 'Failed', time: st.time, resets: st.resets, alarms: st.alarms, score: 0,
    breakdown: null,
    levelName: st.level.name, par: st.level.par,
    artifactsGot: st.artifactsGot, artifactsTotal: st.artifactsTotal,
    isNewBest: false, bestLine: reason, nextAction: null, nextLabel: '',
  };
  ui.resultsAt = performance.now();
  ui.screen = SCREEN_RESULTS;
  ui.buttons = resultsButtons();
  announce(`Failed. ${reason}`);
}

function announce(message) {
  status.textContent = message;
}

function handleClick(click) {
  if (!click) return false;
  for (const b of ui.buttons) {
    if (b.disabled) continue;
    if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
      audio.ensure();
      audio.click();
      b.action();
      return true;
    }
  }
  return false;
}

/** Contextual in-game tutorial prompts for the guided levels (brief B). */
function getHint() {
  const st = world.state;
  const level = st.level;
  if (!level || ui.mode !== 'story' || level.id > 3 || st.time < 4) return '';
  const doorOpen = st.parsed.doors.length > 0 && st.parsed.doors[0].open;
  if (level.id === 1) {
    if (st.artifactsGot === 0) return '→ Walk to the golden artifact ◆';
    return '→ Now reach the green EXIT portal';
  }
  if (level.id === 2) {
    if (!doorOpen) return 'Push the crate onto the gold plate (W) to open the door';
    if (st.artifactsGot === 0) return 'Door open! Grab the artifact ◆';
    return '→ Reach the EXIT';
  }
  // Level 3: the two-Echo chain.
  if (st.echoes.length === 0) return 'Stand on plate 1, then press R — your Echo will hold it';
  if (st.echoes.length === 1) return 'Echo 1 holds plate 1 — now stand on plate 2 and press R';
  if (!doorOpen) return 'Two Echoes hold plates 1 and 2 — stand on plate 3!';
  if (st.artifactsGot === 0) return 'Door open! Grab the artifact ◆';
  return '→ Reach the EXIT';
}

function runShot(name) {
  const scene = stageShot(name, world, createRandom(seed));
  ui.screen = scene.screen;
  ui.buttons = scene.buttons || [];
  ui.results = scene.results || null;
  // Staged results are painted with the reveal animation already finished:
  // resultsAt is set 5 s in the past so the breakdown rows, TOTAL and
  // NEW BEST are all visible on the very first paint (drawResults gates
  // them on elapsed time since resultsAt). Real gameplay still sets
  // resultsAt = performance.now() in finishLevel/failLevel.
  ui.resultsAt = performance.now() - 5000;
  ui.mode = scene.mode || 'story';
  ui.save = save;
  ui.muted = save.muted;
  ui.volume = save.volume;
  let painted = 0;
  function paint() {
    renderer.draw(world, ui, performance.now());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  // Endless name entry: type initials on the results screen (brief E).
  window.addEventListener('keydown', (event) => {
    if (!ui.nameEntry || !ui.nameEntry.active) return;
    if (event.code === 'Enter') {
      savePendingScore(ui.nameEntry.text || 'ACE');
      // input.js queued ACTION_CONFIRM for this same Enter press; drop it so
      // it cannot also advance to the next room.
      ui.suppressConfirm = true;
      event.preventDefault();
    } else if (event.code === 'Backspace') {
      ui.nameEntry.text = ui.nameEntry.text.slice(0, -1);
      event.preventDefault();
    } else if (/^Key[A-Z]$/.test(event.code) && ui.nameEntry.text.length < 3) {
      ui.nameEntry.text += event.code.slice(3);
      event.preventDefault();
    }
  });

  function handleEvents(events) {
    const st = world.state;
    if (events & EVENT_PICKUP) {
      audio.pickup();
      renderer.burst(st.player.x * 64, st.player.y * 64, '#ffd94d');
    }
    if (events & EVENT_PLATE) {
      audio.plate();
      const lp = st.lastPlate;
      if (lp) renderer.burst(lp.x * 64 + 32, lp.y * 64 + 32, '#ffd94d', 10);
    }
    if (events & EVENT_DOOR) {
      audio.door();
      renderer.shake(3);
      for (const d of st.parsed.doors) {
        if (d.open) renderer.burst(d.x * 64 + 32, d.y * 64 + 32, '#2affc4', 12);
      }
      setMessage('Door latched open!', 2);
    }
    if (events & EVENT_ALARM) {
      renderer.shake(6);
      const cause = st.lastAlarmCause;
      if (cause === 'laser') {
        audio.laser();
        setMessage('Laser burn! Back to the start.', 2);
      } else if (cause === 'touch') {
        audio.alarm();
        setMessage('Caught by the drone! Back to the start.', 2);
      } else {
        audio.alarm();
        setMessage('Spotted! Back to the start.', 2);
      }
    }
    if (events & EVENT_ECHO) {
      audio.echo();
      const echo = st.echoes[st.echoes.length - 1];
      if (echo) {
        renderer.ripple(echo.x * 64, echo.y * 64, '#7df9ff');
        renderer.burst(echo.x * 64, echo.y * 64, '#7df9ff', 16);
      }
      setMessage('Echo spawned — it repeats your last loop.', 2.5);
    }
    if (events & EVENT_LASER_OFF) {
      audio.laserOff();
      const sw = st.parsed.switches.find((s) => s.pressed);
      if (sw) renderer.burst(sw.x * 64 + 32, sw.y * 64 + 32, '#b46bff', 10);
    }
    if (events & EVENT_COMPLETE) finishLevel();
    else if (events & EVENT_TIMEOUT) failLevel(world.state.failReason || 'Time ran out.');
  }

  function step() {
    const move = input.move();
    const reset = ui.resetQueued;
    ui.resetQueued = false;
    const events = world.step(STEP, { mx: move.mx, my: move.my, reset });
    if (events) handleEvents(events);
    // Time Trial: record the run so a new best can be saved as a ghost.
    if (ui.mode === 'trial') {
      ui.trialTrace.push({ x: world.state.player.x, y: world.state.player.y });
      if (ui.trialTrace.length > 7200) ui.trialTrace.shift();
    }
    stepCount += 1;
    if (stepCount % 30 === 0 && (move.mx !== 0 || move.my !== 0)) audio.step();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions0 = input.takeActions();
    const click = input.takeClick();
    // A pointer-down queues both a click and ACTION_CONFIRM (click-anywhere to
    // advance). When the click lands on a button, that button is the whole
    // gesture: drop the confirm bit so it cannot also fire on the screen the
    // button just opened (e.g. Quit to menu must stay on the title screen
    // instead of bouncing straight into level select).
    let actions = actions0;
    if (click) {
      const hitButton = handleClick(click);
      if (hitButton) {
        actions &= ~ACTION_CONFIRM;
        // A touch that hit a button was a tap, not a joystick drag: drop the
        // drag it started so it cannot also steer the player.
        input.cancelJoystick();
      }
    }
    // An Enter that just saved Endless initials must not also advance.
    if (ui.suppressConfirm) {
      ui.suppressConfirm = false;
      actions &= ~ACTION_CONFIRM;
    }
    if (actions & ACTION_MUTE) toggleMute();
    if (ui.screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) showSelect('story');
    } else if (ui.screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) pauseGame();
      else if (actions & ACTION_RESET) {
        ui.resetQueued = true;
        audio.reset();
      }
      while (accumulator >= STEP && ui.screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
      // Guided tutorial prompts (L1-L3) and the drone tension layer.
      ui.hint = getHint();
      const maxAlert = world.state.drones.reduce((m, d) => Math.max(m, d.alert || 0), 0);
      if (Math.abs(maxAlert - ui.lastTensionSent) > 0.02) {
        audio.setTension(maxAlert);
        ui.lastTensionSent = maxAlert;
      }
    } else if (ui.screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) resumeGame();
      accumulator = 0;
    } else if (ui.screen === SCREEN_RESULTS) {
      // While initials are being typed, Confirm must not advance the screen.
      if (actions & ACTION_CONFIRM && ui.results && ui.results.nextAction && !ui.nameEntry?.active) ui.results.nextAction();
      accumulator = 0;
    } else {
      accumulator = 0;
    }
    if (ui.message && now > ui.messageUntil) ui.message = '';
    // Hover state for buttons, and the joystick state for the renderer.
    const mouse = input.mouse();
    ui.joystick = input.joystick();
    for (const b of ui.buttons) {
      b.hot = mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h;
    }
    renderer.draw(world, ui, now);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ui.screen === SCREEN_PLAY) pauseGame();
  });

  showTitle();
  announce('Echo Shift. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
