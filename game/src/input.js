// Keyboard and pointer input. Held keys give a pitch and a roll axis and a throttle switch;
// one-shot presses (start or restart, pause) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice.
//
// Pitch: W / ArrowUp noses up, S / ArrowDown noses down. Roll: A / Left and D / Right. Holding Space
// spools the throttle up and releasing it lets the engine ease off; Space and Enter also dismiss the
// menu and the end screen.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let throttle = false;
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    const code = event.code;
    if (PITCH_UP.has(code)) up = true;
    else if (PITCH_DOWN.has(code)) down = true;
    else if (ROLL_LEFT.has(code)) left = true;
    else if (ROLL_RIGHT.has(code)) right = true;
    else if (code === 'Space') {
      throttle = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (CONFIRM.has(code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    const code = event.code;
    if (PITCH_UP.has(code)) up = false;
    else if (PITCH_DOWN.has(code)) down = false;
    else if (ROLL_LEFT.has(code)) left = false;
    else if (ROLL_RIGHT.has(code)) right = false;
    else if (code === 'Space') throttle = false;
  });

  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    throttle = false;
  });

  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 nose down, 1 nose up, 0 for neither or both. */
    pitch() {
      return (up ? 1 : 0) - (down ? 1 : 0);
    },
    /** -1 roll left, 1 roll right, 0 for neither or both. */
    roll() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** Whether the throttle key is held down. */
    throttleHeld() {
      return throttle;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
