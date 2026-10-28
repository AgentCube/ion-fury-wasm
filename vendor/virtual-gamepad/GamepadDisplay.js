var p = Object.defineProperty;
var f = (r, i, o) => i in r ? p(r, i, { enumerable: !0, configurable: !0, writable: !0, value: o }) : r[i] = o;
var g = (r, i, o) => f(r, typeof i != "symbol" ? i + "" : i, o);
import { GamepadApiWrapper as m } from "./GamepadApiWrapper.js";
import { gamepadDirection as a, gamepadButtonType as u } from "./enums.js";
class D {
  /** Create a new GamepadDisplay instance
  * @param config The config to use for the gamepad display
  * @param apiWrapper (OPTIONAL) The gamepad api will use this GamepadApiWrapper instance to listen for gamepad events, otherwise it will create a new gamepad wrapper under the hood.
  */
  constructor(i, o) {
    g(this, "config");
    g(this, "apiWrapper");
    /**
     * Function called by default when the gamepad axies change for a joystick (as configured in this GamepadDisplay)
     * If you specify your own {@link DisplayGamepadConfig.joystickDisplayFunction} in the config, this function won't get called.
     * Instead, you can call this function with the same parameters as passed to the {@link DisplayGamepadConfig.joystickDisplayFunction}
     * if you want to keep the default behaviour (and then you can add your own custom behaviour on top)
     * @param stickConfig The config for the joystick that has changed (as configured in {@link DisplayGamepadConfig.sticks})
     * @param xValue The new x axis value
     * @param yValue The new y axis value
     */
    g(this, "DefaultJoystickDisplayFunction", (i, o, h) => {
      const l = i.movementRange;
      if (i.joystickElement.style.transform = `translate(${o * l}px,${h * l}px)`, i.highlights && this.config.moveDirectionHighlightClass) {
        const s = i.highlights[a.up], t = i.highlights[a.down], e = i.highlights[a.left], n = i.highlights[a.right];
        s && h < -0.1 ? s.classList.add(this.config.moveDirectionHighlightClass || "") : s && s.classList.remove(this.config.moveDirectionHighlightClass || ""), t && h > 0.1 ? t.classList.add(this.config.moveDirectionHighlightClass || "") : t && t.classList.remove(this.config.moveDirectionHighlightClass || ""), e && o < -0.1 ? e.classList.add(this.config.moveDirectionHighlightClass || "") : e && e.classList.remove(this.config.moveDirectionHighlightClass || ""), n && o > 0.1 ? n.classList.add(this.config.moveDirectionHighlightClass || "") : n && n.classList.remove(this.config.moveDirectionHighlightClass || "");
      }
    });
    /**
     * Function called by default when any gamepad buttons change (called separately for each button (as configured in this GamepadDisplay))
     * If you specify your own {@link DisplayGamepadConfig.buttonDisplayFunction} in the config, this function won't get called.
     * Instead, you can call this function with the same parameters as passed to the {@link DisplayGamepadConfig.buttonDisplayFunction}
     * if you want to keep the default behaviour (and then you can add your own custom behaviour on top)
     * @param buttonConfig The config for the button that has changed as configured in {@link DisplayGamepadConfig.buttons}
     * @param value The new value of the button
     * @param touched Whether the button is currently being touched (unused, but included for consistency with the {@link ButtonDisplayFunction} signature)
     * @param pressed Whether the button is currently being pressed (unused, but included for consistency with the {@link ButtonDisplayFunction} signature)
     * @param changes The changes that have occurred since the last update
     * @param btnIndex The index of the button that has changed (unused, but included for consistency with the {@link ButtonDisplayFunction} signature)
     */
    g(this, "DefaultButtonDisplayFunction", (i, o, h, l, s, t) => {
      const e = i.highlight;
      if (this.config.touchedHighlightClass && e && (s.touchDown ? e.classList.add(this.config.touchedHighlightClass) : s.touchUp && e.classList.remove(this.config.touchedHighlightClass)), this.config.pressedHighlightClass && e && (s.pressed ? e.classList.add(this.config.pressedHighlightClass) : s.released && e.classList.remove(this.config.pressedHighlightClass)), i.type == u.variable) {
        const n = i.directionHighlight;
        if (this.config.moveDirectionHighlightClass && n && (s.pressed ? n.classList.add(this.config.moveDirectionHighlightClass) : s.released && n.classList.remove(this.config.moveDirectionHighlightClass)), i.buttonElement) {
          const c = i.direction == a.left || i.direction == a.right, d = i.direction == a.right || i.direction == a.down;
          i.buttonElement.style.transform = `translate${c ? "X" : "Y"}(${d ? "" : "-"}${o * i.movementRange}px)`;
        }
      }
    });
    /**
     * This function is registered as the callback for {@link GamepadApiWrapper.onGamepadAxisChange()}
     * it calls the {@link DisplayGamepadConfig.joystickDisplayFunction} (if specified) or the {@link GamepadDisplay.DefaultJoystickDisplayFunction} otherwise
     * for each configured joystick with axies that have changed
     * @param gpadIndex The index of the gamepad that has changed
     * @param gpadState The new state of the gamepad as reported by the browser
     * @param axisChangesMask An array of booleans, where each true indicates that the corresponding axis has changed since the last update
     */
    g(this, "displayJoystickChanges", (i, o, h) => {
      if (i != this.config.gamepadIndex) return;
      const l = this.config.sticks;
      for (let s = 0; s < l.length; s++) {
        const t = l[s];
        if (t && (t.xAxisIndex !== void 0 && h[t.xAxisIndex] || t.yAxisIndex !== void 0 && h[t.yAxisIndex])) {
          const e = o.axes, n = t.xAxisIndex !== void 0 && e[t.xAxisIndex] || 0, c = t.yAxisIndex !== void 0 && e[t.yAxisIndex] || 0;
          this.config.joystickDisplayFunction ? this.config.joystickDisplayFunction(t, n, c) : this.DefaultJoystickDisplayFunction(t, n, c);
        }
      }
    });
    /**
     * This function is registered as the callback for {@link GamepadApiWrapper.onGamepadButtonChange()}
     * it calls the {@link DisplayGamepadConfig.buttonDisplayFunction} (if specified) or the {@link GamepadDisplay.DefaultButtonDisplayFunction} otherwise
     * for every button that has changed since the last update
     * @param gpadIndex The index of the gamepad that has changed
     * @param gpadState The new state of the gamepad as reported by the browser  / {@link GamepadApiWrapper.onGamepadButtonChange}
     * @param buttonChangesMask An array of buttonChangeDetails or false, where each false in the array indicates that the corresponding button index has not changed since the last update.
     * @returns
     */
    g(this, "displayButtonChanges", (i, o, h) => {
      if (i != this.config.gamepadIndex) return;
      const l = this.config.buttons;
      for (let s = 0; s < l.length; s++) {
        const t = l[s], e = h[s];
        if (!t || Object.keys(t).length == 0 || !e || Object.keys(e).length == 0) continue;
        const n = o.buttons[s].value, c = o.buttons[s].touched, d = o.buttons[s].pressed;
        this.config.buttonDisplayFunction ? this.config.buttonDisplayFunction(t, n, c, d, e, s) : this.DefaultButtonDisplayFunction(t, n, c, d, e, s);
      }
    });
    var h, l;
    this.config = Object.assign({
      // default config
      gamepadIndex: 0,
      buttons: [],
      sticks: [],
      touchedHighlightClass: "touched",
      pressedHighlightClass: "pressed",
      moveDirectionHighlightClass: "active"
    }, i), this.apiWrapper = o || new m({ buttonConfigs: [], updateDelay: 0 }), ((h = this.config.buttons) == null ? void 0 : h.length) !== 0 && this.apiWrapper.onGamepadButtonChange(this.displayButtonChanges), ((l = this.config.sticks) == null ? void 0 : l.length) !== 0 && this.apiWrapper.onGamepadAxisChange(this.displayJoystickChanges);
  }
  /**
   * Cleanup function to remove all event listeners created by the {@link GamepadDisplay}
   * Call this function before removing the gamepad display from the DOM or deleting
   * the {@link GamepadDisplay} instance to prevent memory leaks
   */
  Cleanup() {
    this.apiWrapper.offGamepadButtonChange(this.displayButtonChanges), this.apiWrapper.offGamepadAxisChange(this.displayJoystickChanges);
  }
}
export {
  D as GamepadDisplay
};
//# sourceMappingURL=GamepadDisplay.js.map
