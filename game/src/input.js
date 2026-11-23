// Keyboard input with edge detection: isDown() for held keys, pressed()
// for a key that went down since the last frame (consumed on read).
export function createInput() {
  const keys = new Set();
  const pressedSet = new Set();
  const queue = [];

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!keys.has(e.code)) pressedSet.add(e.code);
    keys.add(e.code);
    queue.push(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    isDown(code) {
      return keys.has(code);
    },
    pressed(code) {
      if (pressedSet.has(code)) {
        pressedSet.delete(code);
        return true;
      }
      return false;
    },
    // Any key pressed since the last frame (for menus).
    anyPressed() {
      return queue.length > 0;
    },
    // Movement vector from WASD / arrows, normalized.
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    endFrame() {
      pressedSet.clear();
      queue.length = 0;
    },
  };
}
