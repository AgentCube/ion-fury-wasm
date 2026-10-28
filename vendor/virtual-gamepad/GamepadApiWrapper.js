var f = Object.defineProperty;
var l = (g, e, t) => e in g ? f(g, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : g[e] = t;
var i = (g, e, t) => l(g, typeof e != "symbol" ? e + "" : e, t);
class C {
  /** Create a new GamepadApiWrapper
   * @param config The configuration options for this wrapper @see {@link wrapperConfig} */
  constructor(e) {
    i(this, "updateDelay");
    i(this, "axisDeadZone");
    i(this, "buttonConfigs");
    i(this, "currentStateOfGamepads");
    i(this, "gamepadConnectListeners");
    i(this, "gamepadDisconnectListeners");
    i(this, "gamepadButtonChangeListeners");
    i(this, "gamepadAxisChangeListeners");
    i(this, "_requestAnimationFrame");
    i(this, "_getGamepads");
    this.updateDelay = e.updateDelay || 0, this.axisDeadZone = e.axisDeadZone || 0, this.buttonConfigs = e.buttonConfigs || [], this.currentStateOfGamepads = [], this.gamepadConnectListeners = [], this.gamepadDisconnectListeners = [], this.gamepadButtonChangeListeners = [], this.gamepadAxisChangeListeners = [], navigator.gamepadInputEmulation = "gamepad", this._requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame, this._getGamepads = navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads || navigator.msGetGamepads, (this.gamepadApiSupported() || navigator.getNativeGamepads !== void 0) && this.tickLoop();
  }
  /** Changes the button configs used by the wrapper (takes effect after the next gamepad update) */
  setButtonsConfig(e) {
    this.buttonConfigs = e;
  }
  /** Changes the update delay between browser gamepad api checks (takes effect after the next gamepad update)
   * @param delay The new delay between gamepad updates in ms */
  setUpdateDelay(e) {
    this.updateDelay = e;
  }
  /** Add an event listener for when a gamepad (either real or emulated) is connected
   * @param Callback The calback function to call when a gamepad is connected */
  onGamepadConnect(e) {
    return this.gamepadConnectListeners.push(e), window.addEventListener("gamepadconnected", e, !0), e;
  }
  /** remove an existing event listener for when a gamepad (either real or emulated) is connected
   * @param Callback The calback function to remove (must be the same function passed to onGamepadConnect()) */
  offGamepadConnect(e) {
    this.gamepadConnectListeners = this.gamepadConnectListeners.filter((t) => t !== e), window.removeEventListener("gamepadconnected", e, !0);
  }
  /** add an event listener for when a gamepad (either real or emulated) is disconnected
   * @param Callback The calback function to call when a gamepad is disconnected */
  onGamepadDisconnect(e) {
    return this.gamepadDisconnectListeners.push(e), window.addEventListener("gamepaddisconnected", e, !0), e;
  }
  /** remove an existing event listener for when a gamepad (either real or emulated) is disconnected
   * @param Callback The calback function to remove (must be the same function passed to onGamepadDisconnect()) */
  offGamepadDisconnect(e) {
    this.gamepadDisconnectListeners = this.gamepadDisconnectListeners.filter((t) => t !== e), window.removeEventListener("gamepaddisconnected", e, !0);
  }
  /** add an event listener for each time a gamepad axis changes.
   * The callback function will be called with the gamepad index, the gamepad object, and a boolean array of the changed axes,
   * The callback is called separately for each gamepad where axes have changed.
   * @param Callback The calback function to call when a gamepad axis state changes */
  onGamepadAxisChange(e) {
    return this.gamepadAxisChangeListeners.push(e), e;
  }
  /** offGamepadAxisChange: remove an existing event listener for when a gamepad axis changes
   * @param Callback The calback function to remove (must be the same function passed to onGamepadAxisChange()) */
  offGamepadAxisChange(e) {
    this.gamepadAxisChangeListeners = this.gamepadAxisChangeListeners.filter((t) => t !== e);
  }
  /**onGamepadButtonChange add an event listener for each time a gamepad button changes.
   * The callback function will be called with the gamepad index, the gamepad object, and a array of the changed buttons containing details about how the button transitioned
   * or false if the button state didn't change this frame. Callback is called separately for each gamepad where buttons have changed.
   * @param Callback The calback function to call when a gamepad button state changes */
  onGamepadButtonChange(e) {
    return this.gamepadButtonChangeListeners.push(e), e;
  }
  /** offGamepadButtonChange: remove an existing event listener for when a gamepad button changes
   * @param Callback The calback function to remove (must be the same function passed to onGamepadButtonChange()) */
  offGamepadButtonChange(e) {
    this.gamepadButtonChangeListeners = this.gamepadButtonChangeListeners.filter((t) => t !== e);
  }
  /** gamepadApiSupported: returns true if the native gamepad api is supported by the browser context */
  gamepadApiSupported() {
    const e = navigator.getNativeGamepads || navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads || navigator.msGetGamepads;
    if (e != null && typeof e == "function")
      try {
        const t = e.apply(navigator);
        return t != null && (t[0] !== void 0 || t.length !== 0 || window.isSecureContext);
      } catch {
        return !1;
      }
    else return !1;
  }
  /** returns the value of navigator.getGamepads() in a cross-browser compatible way
   * @returns An array of gamepad objects (including any emulated gamepads if the GamepadEmulator was set up), or an empty array if the gamepad api is not supported or gampad permissions haven't been granted. */
  getGamepads() {
    const e = navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads || navigator.msGetGamepads;
    return e && typeof e == "function" ? e.apply(navigator) || [] : [];
  }
  /** Returns the result of navigator.getGamepads() from the last update
   * @param forceUpdate If true, navigator.getGamepads() will be called inmediately before returning, if gamepad changes happened since the last update, this will cause those change events to fire.
   * @returns An array of gamepad objects, or an empty array if the gamepad api is not supported */
  getCurrentGamepadStates(e = !1) {
    return e && this.checkForGamepadChanges(), this.currentStateOfGamepads;
  }
  /** (destructor) - Cleans up any event listeners and stops the gamepad check loop. Do not re-use class instance after calling cleanup(). */
  cleanup() {
    this.updateDelay = -1, this.gamepadConnectListeners.forEach((e) => window.removeEventListener("gamepadconnected", e, !0)), this.gamepadDisconnectListeners.forEach((e) => window.removeEventListener("gamepaddisconnected", e, !0)), this.gamepadConnectListeners = [], this.gamepadDisconnectListeners = [], this.gamepadButtonChangeListeners = [], this.gamepadAxisChangeListeners = [];
  }
  tickLoop() {
    this.updateDelay < 0 || (this.checkForGamepadChanges(), this.updateDelay == 0 ? requestAnimationFrame(this.tickLoop.bind(this)) : setTimeout(() => {
      requestAnimationFrame(this.tickLoop.bind(this));
    }, this.updateDelay));
  }
  checkForGamepadChanges() {
    let e = this.getGamepads();
    for (var t = 0; t < e.length; t++) {
      let a = e[t];
      a && (this.checkForAxisChanges(t, a), this.checkForButtonChanges(t, a), this.currentStateOfGamepads[t] = a);
    }
  }
  checkForAxisChanges(e, t) {
    let a = t.axes;
    if (a.length == 0) return;
    const d = this.currentStateOfGamepads[e];
    let m = (d == null ? void 0 : d.axes) || [], h = [], o, s = !1;
    for (o = 0; o < a.length; o++) {
      let n = a[o] || 0, r = m[o] || 0;
      if (n != r) {
        if (Math.abs(n) < this.axisDeadZone && Math.abs(r) < this.axisDeadZone) continue;
        h[o] = !0, s = !0;
      } else
        h[o] = !1;
    }
    s && this.gamepadAxisChangeListeners.forEach((n) => n(e, t, h));
  }
  checkForButtonChanges(e, t) {
    let a = t.buttons;
    if (a.length == 0) return;
    const d = this.currentStateOfGamepads[e], m = (d == null ? void 0 : d.buttons) || a, h = new Array(a.length).fill(!1);
    let o = !1;
    for (let s = 0; s < a.length; s++) {
      let n = !1;
      const r = a[s] || { pressed: !1, value: 0, touched: !1 }, p = m[s] || { pressed: !1, value: 0, touched: !1 }, c = this.buttonConfigs[s] || {}, u = {};
      r.touched && !p.touched ? (u.touchDown = !0, n = !0) : !r.touched && p.touched && (u.touchUp = !0, n = !0), r.pressed && !p.pressed ? (u.pressed = !0, n = !0) : !r.pressed && p.pressed && (u.released = !0, n = !0), c.fireWhileHolding && r.pressed && p.pressed && (u.heldDown = !0, n = !0), r.value != p.value && (u.valueChanged = !0, n = !0), n ? (o = !0, h[s] = u) : h[s] = !1;
    }
    o && this.gamepadButtonChangeListeners.forEach((s) => s(e, t, h));
  }
}
export {
  C as GamepadApiWrapper
};
//# sourceMappingURL=GamepadApiWrapper.js.map
