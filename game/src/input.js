// Keyboard and pointer input. Held keys give a steering vector; one-shot presses (confirm,
// pause, reset, mute) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. Mouse clicks are reported in logical
// 1280x720 coordinates so the menus can hit-test their buttons.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESET = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESET = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let click = null;
  let mouse = { x: 0, y: 0 };

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 720,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (RESET.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESET;
      event.preventDefault();
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointerdown', (event) => {
    click = toLogical(event);
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse = toLogical(event);
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Steering vector, each component in [-1, 1]. */
    move() {
      const mx = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const my = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      return { mx, my };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last pointer-down in logical coordinates, or null. Consumed once. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    mouse() {
      return mouse;
    },
  };
}
