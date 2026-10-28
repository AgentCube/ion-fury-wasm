import { GamepadEmulator } from './vendor/virtual-gamepad/GamepadEmulator.js';
import { GamepadApiWrapper } from './vendor/virtual-gamepad/GamepadApiWrapper.js';
import { GamepadDisplay } from './vendor/virtual-gamepad/GamepadDisplay.js';
import { PRESET_SVG_GPAD_BTN_IDS, PRESET_SVG_GPAD_DPAD_DIAGONAL_TAP_TARGET_IDS_TO_BTN_INDEXES, gamepadButtonType, gamepadDirection } from './vendor/virtual-gamepad/enums.js';

async function setup() {
  if (!window.furyProduction) return;
  const element = id => document.getElementById(id);
  const engine = window.Module;
  const coarse = () => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
  const query = new URLSearchParams(location.search);
  const defaults = { touch: query.has('touch') ? query.get('touch') === '1' : coarse(), scale: 1, opacity: 0.65, sensitivity: 1, deadzone: 0.12, invertY: false, allowNonStandard: false };
  let settings;
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('fury-controller-settings') || '{}') }; }
  catch { settings = { ...defaults }; }
  if (query.has('touch')) settings.touch = query.get('touch') === '1';
  settings.scale = Math.max(0.7, Math.min(1.3, Number(settings.scale) || 1));
  settings.opacity = Math.max(0.2, Math.min(0.9, Number(settings.opacity) || 0.65));
  settings.sensitivity = Math.max(0.2, Math.min(2, Number(settings.sensitivity) || 1));
  settings.deadzone = Math.max(0, Math.min(0.4, Number.isFinite(Number(settings.deadzone)) ? Number(settings.deadzone) : 0.12));
  const emulator = new GamepadEmulator();
  const virtual = emulator.AddEmulatedGamepad(0, false);
  const wrapper = new GamepadApiWrapper({ updateDelay: -1, axisDeadZone: 0, buttonConfigs: [] });
  const owners = new Map();
  const drags = [];
  let previous = '';
  let lastSent = -Infinity;
  let armed = true;
  let focused = document.hasFocus();
  let loaded = false;
  let lastStatus = '';
  let physicalPressed = false;
  const transport = state => {
    const serialized = JSON.stringify(state);
    if (serialized !== previous || performance.now() - lastSent > 250) {
      engine.controllerState?.(state); previous = serialized; lastSent = performance.now();
    }
  };
  function reset() {
    for (const pointerId of owners.keys()) document.dispatchEvent(new PointerEvent('pointerup', { pointerId, bubbles: true }));
    owners.clear();
    for (let button = 0; button < 18; button++) emulator.PressButton(0, button, 0, false);
    for (let axis = 0; axis < 4; axis++) emulator.MoveAxis(0, axis, 0);
    engine.controllerKey?.('Enter', 'Enter', 13, false);
    engine.controllerKey?.('Backspace', 'Backspace', 8, false);
    armed = false; previous = ''; transport(FuryControllerState.neutral());
  }
  function applySettings() {
    engine.touchControls = !!settings.touch;
    document.body.classList.toggle('mobile', coarse());
    document.body.classList.toggle('touch-enabled', !!settings.touch);
    element('touch-controls').hidden = !settings.touch;
    element('mobile-tools').hidden = !(settings.touch || coarse());
    if (element('mobile-tools').hidden) element('tools-panel').hidden = true;
    document.documentElement.style.setProperty('--control-scale', settings.scale);
    document.documentElement.style.setProperty('--control-opacity', settings.opacity);
    for (const drag of drags) drag.dragDistance = 45 * settings.scale;
    try { localStorage.setItem('fury-controller-settings', JSON.stringify(settings)); } catch {}
    if (settings.touch) engine.releasePointer?.();
  }
  for (const key of ['touch', 'scale', 'opacity', 'sensitivity', 'deadzone', 'invertY', 'allowNonStandard']) {
    const input = element('control-' + key);
    if (input.type === 'checkbox') input.checked = !!settings[key]; else input.value = settings[key];
    input.addEventListener('input', () => {
      reset(); settings[key] = input.type === 'checkbox' ? input.checked : Number(input.value); applySettings();
    });
  }
  for (const item of document.querySelectorAll('[data-debug]')) item.hidden = query.get('debug') !== '1';
  element('tools-toggle').addEventListener('click', () => {
    const tools = element('tools-panel'); tools.hidden = !tools.hidden;
    if (!tools.hidden) reset();
  });
  element('stats-toggle').addEventListener('click', () => furyPerformance.toggle());
  element('play-resume').addEventListener('click', () => { element('tools-panel').hidden = true; engine.activate(); });
  element('rotate-resume').addEventListener('click', () => engine.activate());
  element('landscape-fullscreen').addEventListener('click', async () => {
    engine.activate();
    try {
      if (element('game').requestFullscreen) await element('game').requestFullscreen();
      else element('controller-status').textContent = 'Rotate the phone; this browser does not expose page fullscreen.';
      await screen.orientation?.lock?.('landscape').catch(() => {});
    } catch { element('controller-status').textContent = 'Fullscreen/orientation request declined; rotate the phone manually.'; }
  });
  element('send-text').addEventListener('click', () => { engine.controllerText?.(element('save-text').value); engine.activate(); });
  for (const [id, key, code, keyCode] of [['text-confirm', 'Enter', 'Enter', 13], ['text-delete', 'Backspace', 'Backspace', 8]]) {
    const button = element(id);
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); engine.controllerKey?.(key, code, keyCode, true); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => engine.controllerKey?.(key, code, keyCode, false));
  }
  element('test-start').addEventListener('click', async () => {
    try { await furyCapture.start(element('test-phase').value); element('test-status').textContent = 'Recording ' + element('test-phase').value + ' — menus/loading are excluded from FPS/UPS.'; }
    catch (error) { element('test-status').textContent = error.message; }
  });
  element('test-stop').addEventListener('click', async () => { await furyCapture.stop(); element('test-status').textContent = 'Stopped. Download report, or choose another segment and Start Test.'; });
  element('test-download').addEventListener('click', () => furyCapture.download());
  for (const type of ['blur', 'pagehide']) window.addEventListener(type, () => { focused = false; reset(); });
  window.addEventListener('focus', () => { focused = true; armed = false; });
  document.addEventListener('visibilitychange', () => { focused = !document.hidden && document.hasFocus(); reset(); });
  window.addEventListener('resize', () => { reset(); applySettings(); });
  screen.orientation?.addEventListener('change', reset);
  window.addEventListener('gamepaddisconnected', () => { armed = false; transport(FuryControllerState.neutral()); });
  const controls = element('touch-controls');
  controls.addEventListener('contextmenu', event => event.preventDefault());
  controls.addEventListener('pointerdown', event => {
    const target = event.target.closest('.gpad-tap-target');
    if (!target) return;
    if ([...owners.values()].includes(target)) { event.stopImmediatePropagation(); return; }
    owners.set(event.pointerId, target); engine.activate();
  }, true);
  controls.addEventListener('pointerup', event => {
    const target = event.target.closest('.gpad-tap-target');
    if (target && !owners.has(event.pointerId)) event.stopImmediatePropagation();
    owners.delete(event.pointerId);
  }, true);
  function cancel(event) {
    if (!owners.has(event.pointerId)) return;
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: event.pointerId, bubbles: true }));
    const target = owners.get(event.pointerId);
    const button = PRESET_SVG_GPAD_BTN_IDS.findIndex(id => target.id === id + '_tap_target');
    if (button >= 0) emulator.PressButton(0, button, 0, false);
    const diagonal = PRESET_SVG_GPAD_DPAD_DIAGONAL_TAP_TARGET_IDS_TO_BTN_INDEXES[target.id];
    if (diagonal) emulator.PressButton(0, diagonal, 0, false);
    owners.delete(event.pointerId);
  }
  controls.addEventListener('pointercancel', cancel, true);
  controls.addEventListener('lostpointercapture', cancel, true);
  async function loadControls() {
    if (loaded) return;
    loaded = true;
    for (const side of ['left', 'right']) {
      const response = await fetch('vendor/virtual-gamepad/' + side + '.svg', { mode: 'same-origin', redirect: 'error' });
      if (!response.ok) throw new Error('Unable to load local controller preset');
      element('pad-' + side).innerHTML = await response.text();
    }
    for (const text of controls.querySelectorAll('text')) text.textContent = text.textContent === 'Forward' ? (text.closest('#pad-left') ? 'Move' : 'Look') : text.textContent;
    for (const [id, label] of Object.entries({ start_button: 'Options', select_button: 'Map', shoulder_button_front_left: 'L1', shoulder_button_front_right: 'R1', shoulder_trigger_back_left: 'L2', shoulder_trigger_back_right: 'R2' })) {
      const group = controls.querySelector('#' + id);
      if (!group) continue;
      const bounds = (group.querySelector('.gpad-btn-bg') || group).getBBox();
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', bounds.x + bounds.width / 2); text.setAttribute('y', bounds.y + bounds.height / 2 + 3);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('class', 'pad-label'); text.textContent = label; group.append(text);
    }
    const buttons = [];
    const displays = [];
    for (let index = 0; index < PRESET_SVG_GPAD_BTN_IDS.length; index++) {
      const id = PRESET_SVG_GPAD_BTN_IDS[index];
      const target = controls.querySelector('#' + id + '_tap_target');
      if (!target) continue;
      target.setAttribute('aria-label', ['Cross — Use / confirm / restart', 'Circle — Pocket item / back', 'Square — Reload', 'Triangle — Baton', 'L1 — Crouch', 'R1 — Alt fire', 'L2 — Jump', 'R2 — Fire', 'Map', 'Options — Pause', 'Left stick', 'Right stick', 'D-pad up — Previous weapon', 'D-pad down — Next weapon', 'D-pad left — Medkit', 'D-pad right — Radar'][index]);
      if (!id.startsWith('stick_')) buttons.push({ buttonIndex: index, tapTarget: target, type: gamepadButtonType.onOff, lockTargetWhilePressed: true });
      displays[index] = { type: gamepadButtonType.onOff, highlight: controls.querySelector('#' + id + ' .gpad-highlight') || controls.querySelector('#' + id) };
    }
    for (const [id, indexes] of Object.entries(PRESET_SVG_GPAD_DPAD_DIAGONAL_TAP_TARGET_IDS_TO_BTN_INDEXES)) {
      const target = controls.querySelector('#' + id);
      if (target) buttons.push({ buttonIndexes: indexes, tapTarget: target, type: gamepadButtonType.onOff, lockTargetWhilePressed: true });
    }
    emulator.AddButtonTouchEventListeners(0, buttons);
    for (const [side, axis] of [['left', 0], ['right', 2]]) drags.push({ tapTarget: controls.querySelector('#stick_button_' + side + '_tap_target'),
      dragDistance: 45 * settings.scale, xAxisIndex: axis, yAxisIndex: axis + 1, lockTargetWhilePressed: true,
      directions: { [gamepadDirection.up]: true, [gamepadDirection.down]: true, [gamepadDirection.left]: true, [gamepadDirection.right]: true } });
    emulator.AddJoystickTouchEventListeners(0, drags);
    new GamepadDisplay({ gamepadIndex: 0, buttons: displays, sticks: ['left', 'right'].map((side, index) => ({
      joystickElement: controls.querySelector('#stick_button_' + side), movementRange: 12, xAxisIndex: index * 2, yAxisIndex: index * 2 + 1 })) }, wrapper);
  }
  function poll() {
    try {
      if (settings.touch && !controls.querySelector('svg')) loadControls().catch(error => { element('controller-status').textContent = error.message; });
      const pads = Array.from(emulator.getNativeGamepads?.call(navigator) || []).filter(pad => pad?.connected);
      const unknown = pads.some(pad => pad.mapping !== 'standard');
      const physical = pads.map(pad => FuryControllerState.normalize(pad, settings));
      const neutral = physical.every(pad => pad.axes.every(value => value === 0) && pad.buttons.every(value => value === 0));
      if (!armed && neutral) armed = true;
      const enabled = focused && !document.hidden && element('tools-panel').hidden && !(settings.touch && innerHeight > innerWidth);
      const pressed = physical.some(pad => pad.buttons.some(value => value > 0));
      if (enabled && armed && pressed && !physicalPressed) engine.activate();
      physicalPressed = pressed;
      const touch = settings.touch && enabled ? FuryControllerState.normalize(virtual, settings) : FuryControllerState.neutral();
      const state = enabled ? FuryControllerState.merge([touch, ...(armed ? physical : [])]) : FuryControllerState.neutral();
      transport(state);
      if (settings.touch) wrapper.getCurrentGamepadStates(true);
      const status = pads.length ? pads.length + ' physical controller(s)' + (unknown ? ' — nonstandard mapping requires explicit opt-in' : ' — standard mapping') : 'No physical controller. Press a controller button to make it visible.';
      if (status !== lastStatus) { element('controller-status').textContent = status; lastStatus = status; }
    } catch (error) { element('controller-status').textContent = error.message; transport(FuryControllerState.neutral()); }
    requestAnimationFrame(poll);
  }
  applySettings();
  window.furyController = { reset, snapshot: () => ({ touch: !!settings.touch, owners: owners.size, armed, settings: { ...settings } }) };
  requestAnimationFrame(poll);
}
setup().catch(error => { console.error('[fury-controller]', error); document.getElementById('controller-status').textContent = error.message; });
