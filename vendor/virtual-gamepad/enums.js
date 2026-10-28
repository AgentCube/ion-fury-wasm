var g = /* @__PURE__ */ ((e) => (e.up = "up", e.down = "down", e.left = "left", e.right = "right", e))(g || {}), h = /* @__PURE__ */ ((e) => (e.onOff = "onOff", e.variable = "variable", e))(h || {}), c = /* @__PURE__ */ ((e) => (e.real = "real", e.emulated = "emulated", e.overlay = "overlay", e))(c || {}), _ = /* @__PURE__ */ ((e) => (e[e.A = 0] = "A", e[e.B = 1] = "B", e[e.X = 2] = "X", e[e.Y = 3] = "Y", e[e.LShoulder = 4] = "LShoulder", e[e.RShoulder = 5] = "RShoulder", e[e.LTrigger = 6] = "LTrigger", e[e.RTrigger = 7] = "RTrigger", e[e.Back = 8] = "Back", e[e.Start = 9] = "Start", e[e.LStick = 10] = "LStick", e[e.RStick = 11] = "RStick", e[e.DPadUp = 12] = "DPadUp", e[e.DPadDown = 13] = "DPadDown", e[e.DPadLeft = 14] = "DPadLeft", e[e.DPadRight = 15] = "DPadRight", e[e.Xbox = 16] = "Xbox", e))(_ || {}), i = /* @__PURE__ */ ((e) => (e[e.Cross = 0] = "Cross", e[e.Circle = 1] = "Circle", e[e.Square = 2] = "Square", e[e.Triangle = 3] = "Triangle", e[e.L1 = 4] = "L1", e[e.R1 = 5] = "R1", e[e.L2 = 6] = "L2", e[e.R2 = 7] = "R2", e[e.Share = 8] = "Share", e[e.Options = 9] = "Options", e[e.LStick = 10] = "LStick", e[e.RStick = 11] = "RStick", e[e.DPadUp = 12] = "DPadUp", e[e.DPadDown = 13] = "DPadDown", e[e.DPadLeft = 14] = "DPadLeft", e[e.DPadRight = 15] = "DPadRight", e[e.PlayStation = 16] = "PlayStation", e))(i || {}), k = /* @__PURE__ */ ((e) => (e[e.A = 0] = "A", e[e.B = 1] = "B", e[e.X = 2] = "X", e[e.Y = 3] = "Y", e[e.LShoulder = 4] = "LShoulder", e[e.RShoulder = 5] = "RShoulder", e[e.LTrigger = 6] = "LTrigger", e[e.RTrigger = 7] = "RTrigger", e[e.Back = 8] = "Back", e[e.Start = 9] = "Start", e[e.LStick = 10] = "LStick", e[e.RStick = 11] = "RStick", e[e.DPadUp = 12] = "DPadUp", e[e.DPadDown = 13] = "DPadDown", e[e.DPadLeft = 14] = "DPadLeft", e[e.DPadRight = 15] = "DPadRight", e[e.Vendor = 16] = "Vendor", e))(k || {}), r = /* @__PURE__ */ ((e) => (e[e.LStickX = 0] = "LStickX", e[e.LStickY = 1] = "LStickY", e[e.RStickX = 2] = "RStickX", e[e.RStickY = 3] = "RStickY", e))(r || {});
const L = r, f = r;
var D = /* @__PURE__ */ ((e) => (e.TapTarget = "gpad-tap-target", e.ButtonIcon = "gpad-btn-icon", e.ButtonShadow = "gpad-shadow", e.ButtonHighlight = "gpad-highlight", e.ButtonBackground = "gpad-btn-bg", e.DirectionHighlight = "gpad-direction-highlight", e.Thumbstick = "gpad-thumbstick", e.GpadBaseShape = "gpad-base", e.StickBaseShape = "gpad-stick-base", e))(D || {});
const R = [
  "button_1",
  "button_2",
  "button_3",
  "button_4",
  "shoulder_button_front_left",
  "shoulder_button_front_right",
  "shoulder_trigger_back_left",
  "shoulder_trigger_back_right",
  "select_button",
  "start_button",
  "stick_button_left",
  "stick_button_right",
  "dpad_up",
  "dpad_down",
  "dpad_left",
  "dpad_right"
], P = R.map((e) => e + "_tap_target"), T = {
  //     "dpad_up_tap_target": [standardGpadButtonMap.DPadUp],
  //     "dpad_down_tap_target": [standardGpadButtonMap.DPadDown],
  //     "dpad_left_tap_target": [standardGpadButtonMap.DPadLeft],
  //     "dpad_right_tap_target": [standardGpadButtonMap.DPadRight],
  dpad_up_left_tap_target: [
    12,
    14
    /* DPadLeft */
  ],
  dpad_up_right_tap_target: [
    12,
    15
    /* DPadRight */
  ],
  dpad_down_left_tap_target: [
    13,
    14
    /* DPadLeft */
  ],
  dpad_down_right_tap_target: [
    13,
    15
    /* DPadRight */
  ]
};
export {
  R as PRESET_SVG_GPAD_BTN_IDS,
  P as PRESET_SVG_GPAD_BTN_TAP_TARGET_IDS,
  D as PRESET_SVG_GPAD_CLASS,
  T as PRESET_SVG_GPAD_DPAD_DIAGONAL_TAP_TARGET_IDS_TO_BTN_INDEXES,
  h as gamepadButtonType,
  g as gamepadDirection,
  c as gamepadEmulationState,
  f as playStationAxesMap,
  i as playStationButtonMap,
  r as standardGpadAxesMap,
  k as standardGpadButtonMap,
  L as xboxAxesMap,
  _ as xboxButtonMap
};
//# sourceMappingURL=enums.js.map
