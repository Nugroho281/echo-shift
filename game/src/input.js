// Keyboard and pointer input. Held keys give a steering vector; one-shot presses (confirm,
// pause, reset, mute) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. Mouse clicks are reported in logical
// 1280x720 coordinates so the menus can hit-test their buttons.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESET = 4;
export const ACTION_MUTE = 8;

/** Virtual joystick tuning (logical 1280x720 pixels). */
export const JOYSTICK_DEADZONE = 12; // drag less than this far: finger down, no steering
export const JOYSTICK_RADIUS = 60; // drag this far from the touch point: full deflection

/** True on a device with a coarse pointer / touch screen. */
export function isTouchDevice() {
  return 'ontouchstart' in window
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

/**
 * Pure joystick math, so Node can unit-test it: steering vector for a drag
 * from the touch point (ox, oy) to (x, y). Null inside the deadzone; beyond
 * it the direction of the drag, magnitude ramping 0..1 up to JOYSTICK_RADIUS.
 */
export function joystickVector(ox, oy, x, y) {
  const dx = x - ox;
  const dy = y - oy;
  const len = Math.hypot(dx, dy);
  if (len < JOYSTICK_DEADZONE) return null;
  const mag = Math.min(1, (len - JOYSTICK_DEADZONE) / (JOYSTICK_RADIUS - JOYSTICK_DEADZONE));
  return { mx: (dx / len) * mag, my: (dy / len) * mag };
}

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
  // Virtual joystick: the active touch drag, if any — { id, ox, oy, x, y } in
  // logical coordinates. Only a touch pointer starts one; the mouse never does.
  let joy = null;
  const touch = isTouchDevice();

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
    const p = toLogical(event);
    click = p;
    actions |= ACTION_CONFIRM;
    // A touch drag is the virtual joystick; it starts wherever the finger
    // lands. The main loop cancels it when the tap hits a menu button, so a
    // button tap never also steers the player.
    if (event.pointerType === 'touch' && !joy) {
      joy = { id: event.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse = toLogical(event);
    if (joy && event.pointerId === joy.id) {
      const p = toLogical(event);
      joy.x = p.x;
      joy.y = p.y;
    }
  });
  // Touch pointers are implicitly captured to the canvas, so pointerup /
  // pointercancel bubble up to window from there; listening here also covers
  // a finger that slides off the canvas.
  function endTouch(event) {
    if (joy && event.pointerId === joy.id) joy = null;
  }
  window.addEventListener('pointerup', endTouch);
  window.addEventListener('pointercancel', endTouch);

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Whether this device has a touch screen (for touch-only UI). */
    isTouch: touch,
    /**
     * Steering vector, each component in [-1, 1]. An active joystick drag
     * past the deadzone steers; otherwise the held keys steer. The vector is
     * only consumed while gameplay is running, so a drag on a menu screen
     * never moves the player.
     */
    move() {
      if (joy) {
        const v = joystickVector(joy.ox, joy.oy, joy.x, joy.y);
        if (v) return v;
      }
      const mx = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      const my = (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0);
      return { mx, my };
    },
    /** The active joystick drag ({ ox, oy, x, y } logical) or null. */
    joystick() {
      return joy ? { ...joy } : null;
    },
    /** Drop the active joystick drag (a tap that hit a menu button). */
    cancelJoystick() {
      joy = null;
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
