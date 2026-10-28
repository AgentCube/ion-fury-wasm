(() => {
  'use strict';
  const mapping = 'default,Ion Fury Web Controller,a:b0,b:b1,x:b2,y:b3,leftshoulder:b4,rightshoulder:b5,lefttrigger:b6,righttrigger:b7,back:b8,start:b9,leftstick:b10,rightstick:b11,dpup:b12,dpdown:b13,dpleft:b14,dpright:b15,guide:b16,leftx:a0,lefty:a1,rightx:a2,righty:a3,';
  function install(navigator, dispatch, now) {
    let state = FuryControllerState.neutral();
    let connected = false;
    let lastPacket = -Infinity;
    let sequence = -1;
    let timeout = false;
    let samples = 0;
    let pendingButtons = Array(18).fill(0);
    let sampleTimestamp = 0;
    function read(consume = true) {
      samples++;
      const expired = now() - lastPacket > 1000;
      if (expired && !timeout) { state = FuryControllerState.neutral(); pendingButtons.fill(0); timeout = true; }
      if (!connected) return [];
      sampleTimestamp = Math.max(now(), sampleTimestamp + 0.001);
      const buttons = state.buttons.map((value, index) => Math.max(value, pendingButtons[index]));
      if (consume) pendingButtons.fill(0);
      return [{ id: 'Ion Fury Web Controller', index: 0, mapping: 'standard', connected: true,
        timestamp: sampleTimestamp, axes: state.axes,
        buttons: buttons.map(value => ({ value, pressed: value > 0.5, touched: value > 0 })) }];
    }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => read() });
    return {
      update(message) {
        if (!Number.isSafeInteger(message.sequence) || message.sequence <= sequence || !Number.isFinite(message.epoch)) return;
        sequence = message.sequence;
        lastPacket = message.epoch;
        timeout = false;
        state = FuryControllerState.normalize({ ...message.state, mapping: 'standard' }, { deadzone: 0 });
        if (!state.connected) pendingButtons.fill(0);
        else for (let index = 0; index < 18; index++) pendingButtons[index] = Math.max(pendingButtons[index], state.buttons[index]);
        if (!connected && state.connected) {
          connected = true;
          const gamepad = read(false)[0];
          dispatch({ type: 'gamepadconnected', gamepad: { ...gamepad, axes: [0, 0, 0, 0],
            buttons: gamepad.buttons.map(() => ({ value: 0, pressed: false, touched: false })) } });
        }
      },
      snapshot: () => ({ connected, sequence, samples, timedOut: timeout, axes: [...state.axes], buttons: [...state.buttons] })
    };
  }
  globalThis.FuryWorkerController = { install, mapping };
})();
