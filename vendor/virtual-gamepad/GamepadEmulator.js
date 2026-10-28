var L = Object.defineProperty;
var x = (b, e, a) => e in b ? L(b, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : b[e] = a;
var v = (b, e, a) => x(b, typeof e != "symbol" ? e + "" : e, a);
import { gamepadEmulationState as w, gamepadButtonType as y, gamepadDirection as g } from "./enums.js";
import { NormalizeClampVector as T } from "./utilities.js";
const M = 18, A = 4, G = class G {
  /** Creates a new GamepadEmulator object and monkey patches the browser getGamepads() API and gamepad events to report emulated gamepads
   * - **MUST** be called before any other libraries or functions use or store the browser gamepad api!
   * @param buttonPressThreshold - the threshold above which a variable button is considered a "pressed" button */
  constructor(e) {
    /** stores a reference to the real, unpatched navigator.getGamepads() function (if available) **/
    v(this, "getNativeGamepads");
    /** the threshold above which a variable button is considered a "pressed" button */
    v(this, "buttonPressThreshold", 0.1);
    // /** count of real gamepads connected to the browser */
    // protected realGamepadCount: number = 0
    /** A list of the indecies of all the real gamepads that have ever been conected durring this browser session, where the array index is the "gamepadIndex" returned by the native gamepad api, and the value is the index that gamepad should be exposed at in the emulated getGamepads() array */
    v(this, "realGpadToPatchedIndexMap", []);
    /** the reverse mapping array of {@link GamepadEmulator.realGpadToPatchedIndexMap} */
    v(this, "patchedGpadToRealIndexMap", []);
    /** A list of all the emulated gamepads, where the index is the "gamepadIndex" passed when AddEmulatedGamepad() was called (Ie: there may be holes in the list),
     * when an emulated gamepad is "connected" ie: call AddEmulatedGamepad(), it is added to this list at the provided index  (or returns false if there is already an emulated gamepad at that index).
     * when an emulated gamepad is "disconnected" ie: call removeEmulatedGamepad(), it is removed from this list provided index (or returns false if there is already an emulated gamepad at that index). */
    v(this, "emulatedGamepads", []);
    /** A list that mirrors the structure of {@link GamepadEmulator.emulatedGamepads}, but contains data internal to this class for keeping track of their state */
    v(this, "emulatedGamepadsMetadata", []);
    /** stores the function returned by monkeyPatchGamepadEvents() to undo the gamepad event monkey patch  **/
    v(this, "undoEventPatch", () => {
    });
    // Renamed functions for backwards compatibility
    /** @deprecated AddDisplayButtonEventListeners is now called AddButtonTouchEventListeners */
    v(this, "AddDisplayButtonEventListeners", this.AddButtonTouchEventListeners);
    /** @deprecated AddDisplayJoystickEventListeners is now called AddJoystickTouchEventListeners */
    v(this, "AddDisplayJoystickEventListeners", this.AddJoystickTouchEventListeners);
    /** @deprecated ClearDisplayButtonEventListeners is now called ClearButtonTouchEventListeners */
    v(this, "ClearDisplayButtonEventListeners", this.ClearButtonTouchEventListeners);
    /** @deprecated ClearDisplayJoystickEventListeners is now called ClearJoystickTouchEventListeners */
    v(this, "ClearDisplayJoystickEventListeners", this.ClearJoystickTouchEventListeners);
    if (this.buttonPressThreshold = e || this.buttonPressThreshold, G.instanceRunning) throw new Error("Only one GamepadEmulator instance may exist at a time!");
    G.instanceRunning = !0, this.undoEventPatch = this.monkeyPatchGamepadEvents(), this.monkeyPatchGetGamepads();
  }
  /** @returns true if the gamepad api is supported natively by the browser context */
  gamepadApiNativelySupported() {
    return !!this.getNativeGamepads && !!this.getNativeGamepads.apply(navigator);
  }
  /** creates a new emmulated gamepad at the given index as would be read in navigator.getGamepads
   * @param {number} gpadIndex - the index of the gamepad to create, pass null to create a new gamepad at the next available index
   * @param {string} overlayMode - if a real gamepad is connected at the same index as this emulated one and overlayMode is true, the emulated gamepad values will get merged or overlayed on the real gamepad button and axis values, otherwise the emulated gamepad will be shifted to the next available index (appear as a separate gamepad from the real gamepad)
   * @param {number} buttonCount - normally 18, the number of buttons on the gamepad
   * @param {number} axisCount - normally 4, the number of axes on the gamepad */
  AddEmulatedGamepad(e, a, i = M, o = A) {
    if ((e === -1 || !e && e !== 0) && (e = this.nextEmptyEGpadIndex(a)), this.emulatedGamepads[e]) return !1;
    const n = {
      emulation: w.emulated,
      connected: !0,
      timestamp: performance.now(),
      displayId: "Emulated Gamepad " + e,
      id: "Emulated Gamepad " + e + " (Xinput STANDARD GAMEPAD)",
      mapping: "standard",
      index: e,
      buttons: new Array(i).fill({ pressed: !1, value: 0, touched: !1 }, 0, i),
      axes: new Array(o).fill(0, 0, o),
      hapticActuators: []
    };
    this.emulatedGamepads[e] = n, this.emulatedGamepadsMetadata[e] = { overlayMode: a };
    const d = new Event("gamepadconnected");
    return d.gamepad = n, window.dispatchEvent(d), n;
  }
  /** removes the emmulated gamepad at the passed index as would be read from the list in navigator.getGamepads
   * @param {number} gpadIndex - the index of the gamepad to remove */
  RemoveEmulatedGamepad(e) {
    this.ClearButtonTouchEventListeners(e), this.ClearJoystickTouchEventListeners(e);
    var a = this.emulatedGamepads[e];
    if (a) {
      delete this.emulatedGamepads[e], delete this.emulatedGamepadsMetadata[e];
      const i = {
        ...a,
        connected: !1,
        timestamp: performance.now()
      }, o = new Event("gamepaddisconnected");
      o.gamepad = i, window.dispatchEvent(o);
    } else
      console.warn("GamepadEmulator Error: Cannot remove emulated gamepad. No emulated gamepad exists at index " + e);
  }
  /** emulates pressing a button on an emulated gamepad at the given gamepad button index
   * @param {number} gpadIndex - the index of the emulated gamepad (as returned by navigator.getGamepads()) to press the button on
   * @param {number} buttonIndex - the index of the button to press on the gamepad - pass an array of indexes to control multiple buttons at once
   * @param {number} value - the value to set the button to between 0 and 1 (0 = not pressed, 1 = fully pressed, 0.5 = half pressed) if this value is greater than the pressedThreshold from the constructor, the button will be considered pressed
   * @param {boolean} touched - whether the button is considered "touched" or not, a "pressed" button is always considered "touched"
  */
  PressButton(e, a, i, o) {
    var s, r, c;
    if (this.emulatedGamepads[e] == null) throw new Error("Error: PressButton() - no emulated gamepad at index " + e + ", pass a valid index, or call AddEmulatedGamepad() first to create an emulated gamepad at that index");
    const n = [...((s = this.emulatedGamepads[e]) == null ? void 0 : s.buttons) || []], d = i > this.buttonPressThreshold;
    if (Array.isArray(a)) {
      const u = d || (o ?? ((r = n[a[0]]) == null ? void 0 : r.touched)) || !1;
      for (var t = 0; t < a.length; t++) {
        const l = a[t];
        if (l < 0 || l >= this.emulatedGamepads[e].buttons.length) {
          console.error("Error: PressButton() - button index " + l + " out of range, pass a valid index between 0 and " + (this.emulatedGamepads[e].buttons.length - 1));
          continue;
        }
        n[l] = {
          pressed: d,
          value: i || 0,
          touched: u
        };
      }
    } else {
      const u = d || (o ?? ((c = n[a]) == null ? void 0 : c.touched)) || !1;
      if (a < 0 || a >= this.emulatedGamepads[e].buttons.length) {
        console.error("Error: PressButton() - button index " + a + " out of range, pass a valid index between 0 and " + (this.emulatedGamepads[e].buttons.length - 1));
        return;
      }
      n[a] = {
        pressed: d,
        value: i || 0,
        touched: u
      };
    }
    Object.defineProperty(this.emulatedGamepads[e], "buttons", { value: n, enumerable: !0, configurable: !0 });
  }
  /** emulates moving an axis on the gamepad at the given axis index
   * @param gpadIndex - the index of the emulated gamepad to move the axis on
   * @param axisIndex - the index of the axis to move
   * @param value - the value to set the axis to between -1 and 1 (0 = center, -1 = left/up, 1 = right/down) */
  MoveAxis(e, a, i) {
    var n;
    if (this.emulatedGamepads[e] == null) throw new Error("Error: MoveAxis() - no emulated gamepad at index " + e + ", pass a valid index, or call AddEmulatedGamepad() first to create an emulated gamepad at that index");
    const o = [...((n = this.emulatedGamepads[e]) == null ? void 0 : n.axes) || []];
    o[a] = i, Object.defineProperty(this.emulatedGamepads[e], "axes", { value: o, enumerable: !0, configurable: !0 });
  }
  /** add event listeners to the html/svg button elements of an onscreen gamepad to emulate gamepad input  when touched, clicked or dragged
  * @param gpadIndex - the index of the emulated gamepad to register events for
  * @param buttonConfigs - an array of config objects that set how each of the buttons on the onscreen gamepad should behave, and how they map to the emulated gamepad buttons. */
  AddButtonTouchEventListeners(e, a) {
    if (!this.emulatedGamepads[e]) throw new Error("Error: AddJoystickTouchEventListeners() - no emulated gamepad at index " + e + ", pass a valid index, or call AddEmulatedGamepad() first to create an emulated gamepad at that index");
    let i = [];
    for (var o = 0; o < a.length; o++) {
      const n = a[o];
      if (!n) continue;
      const d = n.buttonIndexes ?? n.buttonIndex, t = n.tapTarget;
      if (!t) {
        console.warn("GamepadEmulator: No tap target in gamepad " + e + " display config for button " + d + ", skipping...");
        continue;
      }
      const s = (l) => {
        const m = l.changedTouches[0].target;
        (m == t || m.parentElement == t) && l.preventDefault();
      };
      window.addEventListener("touchstart", s, { passive: !1 });
      const r = (l) => {
        const m = l.buttons == 1 ? 1 : 0;
        (!n.lockTargetWhilePressed || m == 0) && this.PressButton(e, d, m, !0);
      };
      t.addEventListener("pointerenter", r);
      const c = (l) => {
        const m = l.buttons == 1 ? 1 : 0;
        (!n.lockTargetWhilePressed || m == 0) && this.PressButton(e, d, 0, !1);
      };
      t.addEventListener("pointerleave", c);
      const u = (l) => {
        this.PressButton(e, d, 0, !1);
      };
      if (t.addEventListener("pointercancel", u), n.type == y.onOff) {
        const l = (p) => {
          p.preventDefault(), this.PressButton(e, d, 1, !0), n.lockTargetWhilePressed ? t.setPointerCapture(p.pointerId) : t.releasePointerCapture(p.pointerId);
        };
        t.addEventListener("pointerdown", l);
        const m = () => {
          this.PressButton(e, d, 0);
        };
        t.addEventListener("pointerup", m), i.push(function() {
          window.removeEventListener("touchstart", s), t.removeEventListener("pointerenter", r), t.removeEventListener("pointerleave", c), t.removeEventListener("pointerdown", l), t.removeEventListener("pointerup", m), t.removeEventListener("pointercancel", u);
        });
      } else if (n.type == y.variable) {
        const l = this.AddDragControlListener(n, (m, p, f) => {
          let h = m ? this.buttonPressThreshold + 1e-5 : 0;
          h += n.directions[g.left] || n.directions[g.right] ? Math.abs(p) : 0, h += n.directions[g.up] || n.directions[g.down] ? Math.abs(f) : 0, this.PressButton(e, d, Math.min(h, 1));
        });
        i.push(function() {
          window.removeEventListener("touchstart", s), t.removeEventListener("pointerenter", r), t.removeEventListener("pointerleave", c), t.removeEventListener("pointercancel", u), l();
        });
      }
    }
    this.emulatedGamepadsMetadata[e].removeButtonListenersFunc = () => {
      i.forEach((n) => n());
    };
  }
  /** add event listeners to the html/svg joystick elements of an onscreen gamepad to emulate gamepad input when dragged with a mouse, touch or pen.
  * @param gpadIndex - the index of the emulated gamepad to register events for
  * @param joystickConfigs - an array of config objects that set how each of the joysticks on the onscreen gamepad should behave, and how they map to the emulated gamepad axes. */
  AddJoystickTouchEventListeners(e, a) {
    if (!this.emulatedGamepads[e]) throw new Error("Error: AddJoystickTouchEventListeners() - no emulated gamepad at index " + e + ", pass a valid index, or call AddEmulatedGamepad() first to create an emulated gamepad at that index");
    let i = [];
    for (let o = 0; o < a.length; o++) {
      const n = a[o];
      if (!n) continue;
      if (n.tapTarget == null) {
        console.warn("GamepadEmulator: No tap target in gamepad " + e + " display config for joystick " + o + ", skipping...");
        continue;
      }
      const d = this.AddDragControlListener(n, (t, s, r) => {
        n.xAxisIndex !== void 0 && this.MoveAxis(e, n.xAxisIndex, s), n.yAxisIndex !== void 0 && this.MoveAxis(e, n.yAxisIndex, r);
      });
      i.push(d);
    }
    this.emulatedGamepadsMetadata[e].removeJoystickListenersFunc = () => {
      i.forEach((o) => o());
    };
  }
  /** removes event listeners added with AddButtonTouchEventListeners()
  * @param gpadIndex - the index of the emulated gamepad to un-register events for */
  ClearButtonTouchEventListeners(e) {
    var a;
    this.emulatedGamepadsMetadata[e] && ((a = this.emulatedGamepadsMetadata[e]) != null && a.removeButtonListenersFunc) && this.emulatedGamepadsMetadata[e].removeButtonListenersFunc();
  }
  /** removes event listeners added with AddJoystickTouchEventListeners()
   * @param gpadIndex - the index of the emulated gamepad to un-register events for */
  ClearJoystickTouchEventListeners(e) {
    var a;
    this.emulatedGamepadsMetadata[e] && ((a = this.emulatedGamepadsMetadata[e]) != null && a.removeJoystickListenersFunc) && this.emulatedGamepadsMetadata[e].removeJoystickListenersFunc();
  }
  AddDragControlListener(e, a) {
    let i = {
      startX: 0,
      startY: 0
    }, o = -1;
    const n = (s) => {
      var r = s.pointerId;
      if (o === r) {
        const c = e.directions[g.left] ? -1 : 0, u = e.directions[g.right] ? 1 : 0, l = e.directions[g.up] ? -1 : 0, m = e.directions[g.down] ? 1 : 0, p = s.clientX - i.startX, f = s.clientY - i.startY;
        let { x: h, y: E } = T(p, f, e.dragDistance);
        h = Math.max(Math.min(h, u), c), E = Math.max(Math.min(E, m), l), a(!0, h, E);
      }
    }, d = (s) => {
      o == s.pointerId && (document.removeEventListener("pointermove", n, !1), document.removeEventListener("pointerup", d, !1), o = -1, a(!1, 0, 0));
    };
    e.tapTarget.addEventListener("pointerdown", (s) => {
      s.preventDefault(), i.startX = s.clientX, i.startY = s.clientY, o = s.pointerId, e.lockTargetWhilePressed ? e.tapTarget.setPointerCapture(s.pointerId) : e.tapTarget.releasePointerCapture(s.pointerId), a(!0, 0, 0), document.addEventListener("pointermove", n, !1), document.addEventListener("pointerup", d, !1);
    });
    const t = (s) => {
      s.changedTouches[0].target == e.tapTarget && s.preventDefault();
    };
    return window.addEventListener("touchstart", t, { passive: !1 }), function() {
      window.removeEventListener("touchstart", t), e.tapTarget.removeEventListener("pointerdown", n);
    };
  }
  /** returns copy of the passed Gamepad object
   * The axies and buttons arrays are deep copied.
   * Every other property is a shallow copy
   * @param original - the gamepad object to copy */
  cloneGamepad(e) {
    if (!e) return e;
    const a = e.axes ? e.axes.length : 0, i = e.buttons ? e.buttons.length : 0, o = {};
    for (let n in e)
      if (n === "axes") {
        const d = new Array(a);
        for (let t = 0; t < a; t++)
          d[t] = Number(e.axes[t]);
        Object.defineProperty(o, "axes", { value: d, enumerable: !0, configurable: !0 });
      } else if (n === "buttons") {
        const d = new Array(i);
        for (let t = 0; t < i; t++) {
          const s = e.buttons[t];
          if (s == null) d[t] = s;
          else {
            const r = s.pressed, c = s.value, u = s.touched || !1;
            d[t] = { pressed: r, value: c, touched: u };
          }
        }
        Object.defineProperty(o, "buttons", { value: d, enumerable: !0, configurable: !0 });
      } else
        Object.defineProperty(o, n, { get: () => e[n], configurable: !0, enumerable: !0 });
    return o.emulation || Object.defineProperty(o, "emulation", { value: w.real, configurable: !0, enumerable: !0 }), o;
  }
  /** Searches for the next available index a new emulated gamepad could go and returns that index
  * this means no emulated gamepad is at that index and either the no real gamepad is at that index, or a real gamepad is at that index, but the @param overlayMode is true. */
  nextEmptyEGpadIndex(e) {
    let a = 0;
    if (e)
      do {
        if (!this.emulatedGamepads[a]) break;
        a++;
      } while (a < this.emulatedGamepads.length);
    else {
      const i = Math.max(this.emulatedGamepads.length, this.patchedGpadToRealIndexMap.length);
      do {
        if (!this.emulatedGamepads[a] && this.patchedGpadToRealIndexMap[a] == null) break;
        a++;
      } while (a < i);
    }
    return a;
  }
  /** Searches for the next available index a freshly connected real gamepad could go and returns that index
   * this means no real gamepad is mapped to that index and either no emulated gamepad is at that index, or the emulated gamepad is in overlay mode
   * @param startingIndex the index to start searching from */
  nextEmptyRealGpadIndex(e) {
    let a = e;
    const i = Math.max(this.emulatedGamepads.length, this.patchedGpadToRealIndexMap.length);
    do {
      const o = this.emulatedGamepadsMetadata[a], n = this.realGpadToPatchedIndexMap[a] == null && this.patchedGpadToRealIndexMap[a] == null;
      if (o && o.overlayMode || !o && n) break;
      a++;
    } while (a < i);
    return a;
  }
  /** Intercepts gamepadconnected & gamepaddisconnected events and re-sends them with the correct gamepad indecies */
  monkeyPatchGamepadEvents() {
    let e, a, i, o;
    window.hasOwnProperty("ongamepadconnected") && (e = Object.getOwnPropertyDescriptor(window, "ongamepadconnected"), e.configurable = !0, i = window.ongamepadconnected, window.ongamepadconnected = null, Object.defineProperty(window, "ongamepadconnected", {
      get: () => function(t) {
      },
      // returns an empty function, so no event is fired
      set: (t) => {
        i = t;
      },
      configurable: !0
    })), window.hasOwnProperty("ongamepaddisconnected") && (a = Object.getOwnPropertyDescriptor(window, "ongamepaddisconnected"), a.configurable = !0, o = window.ongamepaddisconnected, window.ongamepaddisconnected = null, Object.defineProperty(window, "ongamepaddisconnected", {
      get: () => function(t) {
      },
      // returns an empty function, so no event is fired
      set: (t) => {
        i = t;
      },
      configurable: !0
    }));
    const n = (t) => {
      const s = t.gamepad;
      if (s && s.emulation === void 0) {
        t.stopImmediatePropagation(), t.preventDefault();
        const r = this.cloneGamepad(t.gamepad), c = r.index, u = this.nextEmptyRealGpadIndex(c);
        this.realGpadToPatchedIndexMap[c] = u, this.patchedGpadToRealIndexMap[u] = c, Object.defineProperty(r, "index", { get: () => u }), Object.defineProperty(r, "emulation", { get: () => w.real });
        const l = new Event(t.type || "gamepadconnected");
        l.gamepad = r, window.dispatchEvent(l);
      }
      i && i.call(window, t);
    };
    window.addEventListener("gamepadconnected", n);
    const d = (t) => {
      const s = t.gamepad;
      if (s && s.emulation === void 0) {
        t.stopImmediatePropagation(), t.preventDefault();
        const r = this.cloneGamepad(t.gamepad), c = this.realGpadToPatchedIndexMap[r.index] || r.index;
        Object.defineProperty(r, "index", { get: () => c }), Object.defineProperty(r, "emulation", { get: () => w.real }), delete this.realGpadToPatchedIndexMap[r.index], delete this.patchedGpadToRealIndexMap[c];
        const u = new Event(t.type || "gamepaddisconnected");
        u.gamepad = r, window.dispatchEvent(u);
      }
      o && o.call(window, t);
    };
    return window.addEventListener("gamepaddisconnected", d), function() {
      window.removeEventListener("gamepadconnected", n), window.hasOwnProperty("ongamepadconnected") && (Object.defineProperty(window, "ongamepadconnected", e), window.ongamepadconnected = i), window.removeEventListener("gamepaddisconnected", d), window.hasOwnProperty("ongamepaddisconnected") && (Object.defineProperty(window, "ongamepaddisconnected", a), window.ongamepaddisconnected = o);
    };
  }
  /** overwrite the browser gamepad api getGamepads() to return the emulated gamepad data for gamepad indexes corresponding to emulated gamepads
   * if a real gamepad is found with the same index value as an emulated gamepad, the  the navigator.getGamepads() list will either shift the emulated gamepad's index up to make room for the real gamepad when (emulatedGamepad.overlayMode = false),
   * or it will return the emulated gamepad "overlayed" on the real one where buttons pressed or axes moved on both the real gamepad and the emulated one will show up on that gamepad. */
  monkeyPatchGetGamepads() {
    const e = this;
    let a = navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads || navigator.msGetGamepads;
    this.getNativeGamepads = a, navigator.getNativeGamepads = a || function() {
      return [];
    }, Object.defineProperty(navigator, "getGamepads", {
      configurable: !0,
      value: function() {
        var d;
        let i = e.emulatedGamepads, o = a != null ? a.apply(navigator) || [] : [], n = new Array(Math.max(o.length, i.length)).fill(null);
        for (let t = 0; t < o.length; t++) {
          const s = o[t];
          if (!s) continue;
          let r = e.cloneGamepad(s), c = e.realGpadToPatchedIndexMap[r.index] || r.index;
          Object.defineProperty(r, "index", { get: () => c }), n[c] = r;
        }
        for (let t = 0; t < i.length; t++) {
          let s = n[t], r = i[t];
          if (r && s) {
            Object.defineProperty(n[t], "emulation", { value: w.overlay, configurable: !0 });
            let c = Math.max(((d = s == null ? void 0 : s.buttons) == null ? void 0 : d.length) ?? 0, r.buttons.length), u = new Array(c);
            for (let p = 0; p < c; p++) {
              const f = (r == null ? void 0 : r.buttons[p]) || { touched: !1, pressed: !1, value: 0 }, h = (s == null ? void 0 : s.buttons[p]) || { touched: !1, pressed: !1, value: 0 };
              u[p] = {
                touched: f.touched || h.touched || !1,
                pressed: f.pressed || h.pressed || !1,
                value: Math.max(f.value, h.value) || 0
              };
            }
            Object.defineProperty(n[t], "buttons", { value: u, enumerable: !0, configurable: !0 });
            let l = Math.max(r.axes.length, s.axes.length), m = new Array(c);
            for (let p = 0; p < l; p++) {
              const f = r.axes[p] ?? 0, h = s.axes[p] ?? 0;
              m[p] = Math.abs(f) > Math.abs(h) ? f : h;
            }
            Object.defineProperty(n[t], "axes", { value: m, enumerable: !0, configurable: !0 });
          } else r && (Object.defineProperty(r, "emulation", { value: w.emulated, enumerable: !0, configurable: !0 }), Object.defineProperty(r, "timestamp", { value: performance.now(), enumerable: !0, configurable: !0 }), n[t] = e.cloneGamepad(r));
        }
        return n;
      }
    });
  }
  /** (destructor) - Cleans up any event listeners made by this class and restores the normal navigator.getGamepad() function and gamepad events */
  cleanup() {
    for (let e = 0; e < this.emulatedGamepads.length; e++)
      this.ClearButtonTouchEventListeners(e), this.ClearJoystickTouchEventListeners(e);
    this.emulatedGamepads = [], this.undoEventPatch(), this.getNativeGamepads ? Object.defineProperty(navigator, "getGamepads", {
      value: this.getNativeGamepads,
      configurable: !0
    }) : Object.defineProperty(navigator, "getGamepads", {
      value: void 0,
      configurable: !0
    }), G.instanceRunning = !1, delete navigator.getNativeGamepads;
  }
};
/** a static class variable to tell if any other instances of the GamepadEmulator class are active, and throw an error if a new one is created */
v(G, "instanceRunning", !1);
let P = G;
export {
  A as DEFAULT_GPAD_AXIS_COUNT,
  M as DEFAULT_GPAD_BUTTON_COUNT,
  P as GamepadEmulator
};
//# sourceMappingURL=GamepadEmulator.js.map
