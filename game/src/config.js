// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area
// (a 20x11 grid of 64 px tiles = 1280x704, plus a 16 px timeline strip at the bottom); the
// renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 64;
export const COLS = 20;
export const ROWS = 11;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  speed: 5.2, // tiles per second
  radius: 0.28, // tiles, half-size of the collision box
  accel: 50, // tiles/s^2 while steering (smooth start, brief C)
  friction: 45, // tiles/s^2 while coasting to a stop
};

export const DRONE = {
  speed: 1.6, // tiles per second on patrol
  range: 3.5, // detection cone length, tiles
  halfAngle: 0.96, // radians (~55 degrees) either side of the facing direction
  distractSeconds: 3, // how long a seen echo holds a drone's attention
  alarmCooldown: 1.5, // seconds after an alarm before another can fire
  alertFill: 1.2, // seconds of continuous exposure to fill the alert meter (brief C)
  alertDecay: 0.8, // seconds out of the cone to drain a full meter
};

/** One recording holds at most this many ticks (60 s); a longer loop auto-resets. */
export const MAX_RECORD_TICKS = 3600;

export const PALETTE = {
  backdrop: '#07070f',
  floorA: '#101020',
  floorB: '#0d0d1c',
  wall: '#1d1d38',
  wallEdge: '#3d3d7a',
  grid: '#181830',
  player: '#22e6ff',
  playerDark: '#0a7d99',
  echo: '#7df9ff',
  echoDim: '#3fb7d6',
  gold: '#ffc94d',
  goldDark: '#b98a1d',
  purple: '#b46bff',
  laser: '#ff2e63',
  laserDim: '#7a1030',
  door: '#2affc4',
  doorClosed: '#123f36',
  exit: '#39ff88',
  artifact: '#ffd94d',
  text: '#eef1ff',
  muted: '#8b93b8',
  panel: '#12122a',
  panelEdge: '#2c2c5e',
  danger: '#ff4d6d',
  button: '#1c1c44',
  buttonHot: '#2c2c6e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'echo-shift.save.v1';
