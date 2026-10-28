function i(t, e, n) {
  const r = Math.sqrt(t * t + e * e);
  return r > n ? { x: t / r, y: e / r } : { x: t / n, y: e / n };
}
function o(t) {
  if (t instanceof SVGGraphicsElement) {
    t.getAttribute("transform") && console.warn("VirtualGamepadLib: Setting Transform origin on an element that already has a transform attribute. This may break the transform!", t);
    const e = t.getBBox();
    t.style.transformOrigin = `${e.x + e.width / 2}px ${e.y + e.height / 2}px`;
  } else if (t instanceof HTMLElement) {
    console.warn("VirtualGamepadLib: Setting Transform origin on an element that is not an SVG element. This may break the transform!", t);
    const e = t.getBoundingClientRect();
    t.style.transformOrigin = `${e.width / 2}px ${e.height / 2}px`;
  }
}
function a(t) {
  if (t instanceof SVGGraphicsElement) {
    const e = t.getBBox(), n = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    n.setAttribute("fill", "#FF0000A0"), n.setAttribute("x", e.x.toString()), n.setAttribute("y", e.y.toString()), n.setAttribute("width", e.width.toString()), n.setAttribute("height", e.height.toString()), t.insertAdjacentElement("afterend", n);
  } else if (t instanceof HTMLElement) {
    console.warn("VirtualGamepadLib: Setting Transform origin on an element that is not an SVG element. This may break the transform!", t);
    const e = t.getBoundingClientRect(), n = document.createElement("div");
    n.style.position = "absolute", n.style.backgroundColor = "#FF0000A0", n.style.left = e.left.toString(), n.style.top = e.top.toString(), n.style.width = e.width.toString(), n.style.height = e.height.toString(), t.insertAdjacentElement("afterend", n);
  }
}
export {
  o as CenterTransformOrigin,
  a as CenterTransformOriginDebug,
  i as NormalizeClampVector
};
//# sourceMappingURL=utilities.js.map
