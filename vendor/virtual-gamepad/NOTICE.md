# Vendored virtual-gamepad-lib

Version 0.3.3, from https://registry.npmjs.org/virtual-gamepad-lib/-/virtual-gamepad-lib-0.3.3.tgz
Upstream: https://github.com/KW-M/virtual-gamepad-lib
Package SHA-1: e71faca1a4add2268a23f5097374149021ab02e9

MIT license, reproduced in LICENSE. JavaScript, CSS and left/right rounded SVG presets are unmodified copies (SVG files renamed only). Source maps and build tooling are not required at runtime. The declared SVGO peer dependency is an SVG authoring tool, not imported by these runtime modules. No Android/Bannerlator runtime is included.

The Ion Fury adapter adds cancellation/ownership handling around the library because 0.3.3's joystick drag listener does not handle pointercancel/lostpointercapture. It does not replace the library's SVG, drag normalization, button handling or display components.
