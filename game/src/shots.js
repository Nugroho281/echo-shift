// The screenshot scenes behind ?shot=start|play|action|end. Each one plays the real rules
// forward from a fresh world, steered by a tiny waypoint pilot (move toward the next
// waypoint, one axis at a time), so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { LEVELS } from './levels.js';
import { EVENT_COMPLETE } from './world.js';
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_RESULTS, SCREEN_TITLE } from './render.js';

function steer(world, tx, ty) {
  const p = world.state.player;
  const dx = tx + 0.5 - p.x;
  const dy = ty + 0.5 - p.y;
  if (Math.abs(dx) < 0.12 && Math.abs(dy) < 0.12) return { mx: 0, my: 0, arrived: true };
  if (Math.abs(dx) >= Math.abs(dy)) return { mx: Math.sign(dx), my: 0, arrived: false };
  return { mx: 0, my: Math.sign(dy), arrived: false };
}

function runSteps(world, count, fn) {
  let events = 0;
  for (let i = 0; i < count; i += 1) {
    const input = fn ? fn(i) : { mx: 0, my: 0, reset: false };
    events |= world.step(STEP, input);
    if (events & EVENT_COMPLETE) break;
  }
  return events;
}

function goTo(world, tx, ty, maxTicks = 1200) {
  let ticks = 0;
  while (ticks < maxTicks) {
    const s = steer(world, tx, ty);
    if (s.arrived) return true;
    world.step(STEP, { mx: s.mx, my: s.my, reset: false });
    ticks += 1;
    if (world.state.complete) return true;
  }
  return false;
}

function waitTicks(world, n) {
  runSteps(world, n, () => ({ mx: 0, my: 0, reset: false }));
}

/**
 * Set `world` to the named scene and return the screen and UI to draw over it.
 * start: the title screen. play: level 8 mid-puzzle, one Echo holding a plate.
 * action: level 7, an Echo distracting a drone while the player slips past.
 * end: the level 1 results screen with a medal.
 */
export function stageShot(name, world, random) {
  if (name === 'play') {
    world.loadLevel(LEVELS[7], 'story'); // Level 8: Twin Plates
    goTo(world, 4, 1);
    waitTicks(world, 30);
    world.step(STEP, { mx: 0, my: 0, reset: true });
    goTo(world, 12, 5);
    waitTicks(world, 20);
    return { screen: SCREEN_PLAY, mode: 'story', buttons: [] };
  }
  if (name === 'action') {
    world.loadLevel(LEVELS[6], 'story'); // Level 7: Distraction
    // Walk into the drone's view, stand there, let it spot the player, then reset.
    goTo(world, 4, 5);
    waitTicks(world, 240);
    world.step(STEP, { mx: 0, my: 0, reset: true });
    waitTicks(world, 150);
    goTo(world, 10, 7);
    return { screen: SCREEN_PLAY, mode: 'story', buttons: [] };
  }
  if (name === 'end') {
    world.loadLevel(LEVELS[0], 'story'); // Level 1: First Steps
    goTo(world, 8, 1);
    goTo(world, 10, 9);
    return {
      screen: SCREEN_RESULTS,
      mode: 'story',
      results: {
        medal: 'Gold', time: 14.2, resets: 0, alarms: 0, score: 1458,
        breakdown: { base: 1000, timeBonus: 158, medalBonus: 300, resetPenalty: 0, alarmPenalty: 0, total: 1458 },
        levelName: 'First Steps', par: 15, artifactsGot: 1, artifactsTotal: 1,
        isNewBest: true, bestLine: '★ NEW BEST ★', nextAction: null, nextLabel: '',
      },
      buttons: [],
    };
  }
  // start (and anything else): the title screen — all six buttons, same
  // positions as the real title screen, so the cover shot is faithful.
  world.loadLevel(LEVELS[3], 'story');
  return {
    screen: SCREEN_TITLE,
    mode: 'story',
    buttons: [
      { x: 490, y: 420, w: 300, h: 54, label: '▶  STORY MODE', sub: '12 handcrafted levels', action: () => {}, disabled: false, hot: false },
      { x: 490, y: 486, w: 300, h: 54, label: 'ENDLESS HEIST', sub: 'Procedural rooms', action: () => {}, disabled: false, hot: false },
      { x: 490, y: 552, w: 300, h: 54, label: 'TIME TRIAL', sub: 'Race your best times', action: () => {}, disabled: false, hot: false },
      { x: 490, y: 618, w: 145, h: 40, label: 'Settings', sub: '', action: () => {}, disabled: false, hot: false },
      { x: 650, y: 618, w: 145, h: 40, label: 'How to play', sub: '', action: () => {}, disabled: false, hot: false },
      { x: 810, y: 618, w: 145, h: 40, label: '🏛 Gallery', sub: '', action: () => {}, disabled: false, hot: false },
    ],
  };
}
