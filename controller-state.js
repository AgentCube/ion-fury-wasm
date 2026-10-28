(() => {
  'use strict';
  const neutral = () => ({ connected: false, axes: [0, 0, 0, 0], buttons: Array(18).fill(0) });
  const finite = (value, low, high) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : 0;
  function stick(horizontal, vertical, deadzone) {
    const magnitude = Math.hypot(horizontal, vertical);
    if (magnitude <= deadzone) return [0, 0];
    const scale = Math.min(1, (magnitude - deadzone) / (1 - deadzone)) / magnitude;
    return [horizontal * scale, vertical * scale];
  }
  function normalize(pad, settings = {}) {
    if (!pad?.connected || (pad.mapping !== 'standard' && !settings.allowNonStandard)) return neutral();
    const deadzone = finite(settings.deadzone ?? 0.12, 0, 0.5);
    const left = stick(finite(pad.axes?.[0], -1, 1), finite(pad.axes?.[1], -1, 1), deadzone);
    const right = stick(finite(pad.axes?.[2], -1, 1), finite(pad.axes?.[3], -1, 1), deadzone);
    const sensitivity = finite(settings.sensitivity ?? 1, 0.2, 2);
    return { connected: true, axes: [...left, finite(right[0] * sensitivity, -1, 1), finite(right[1] * sensitivity * (settings.invertY ? -1 : 1), -1, 1)],
      buttons: Array.from({ length: 18 }, (_, index) => {
        const button = pad.buttons?.[index];
        return finite(typeof button === 'number' ? button : button?.value ?? (button?.pressed ? 1 : 0), 0, 1);
      }) };
  }
  function merge(pads) {
    const result = neutral();
    for (const pad of pads) {
      if (!pad.connected) continue;
      result.connected = true;
      for (let axis = 0; axis < 4; axis++) if (Math.abs(pad.axes[axis]) > Math.abs(result.axes[axis])) result.axes[axis] = pad.axes[axis];
      for (let button = 0; button < 18; button++) result.buttons[button] = Math.max(result.buttons[button], pad.buttons[button]);
    }
    return result;
  }
  const api = { neutral, normalize, merge };
  globalThis.FuryControllerState = api;
})();
