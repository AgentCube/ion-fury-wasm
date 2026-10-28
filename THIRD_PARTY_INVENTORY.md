# Included materials — publication notice checklist

This is an inventory, not a new license grant or final legal notice. Distribution permission for game content is user-supplied. Final notices and corresponding-source distribution must be completed by the user before publication.

## Browser runtime

- `worker-engine.js`, `worker-engine.wasm`: unchanged Phase 9 production EDuke32/Build/Ion Fury engine, compiled using Emscripten 6.0.11, Classic renderer, Asyncify, SDL2 2.32.10. Mixed engine/BUILD and dependency terms, not a blanket MIT license. Existing GPL and BUILD texts are in `licenses/`. Preserve complete corresponding modified source and build instructions separately through an applicable distribution method; the staging directory is not the corresponding-source repository.
- Embedded native code includes EDuke32 game/audiolib/mact/Build code, SDL2/Emscripten runtime glue, libxmp-lite, minivorbis (Ogg/Vorbis), miniz/ZIP support, LZ4, xxHash, libdivide, libasync and other bundled Build utility code (including image decoding and logging). Review source-level notices for the exact compiled implementation, including transitive components; no proprietary storefront SDK/DLL, native executable, Polymer/OpenGL renderer, GTK or network backend is included. The engine's exact unchanged binary hashes appear in `FILE_INVENTORY.json`.
- Native provenance: working EDuke32-WASM fork from DigitalCyberSoft/eduke32-wasm with this project's Phase 2–9 modifications; source directories `source/duke3d`, `source/build`, `source/audiolib`, `source/libxmp-lite`, `source/mact`; applicable notices remain in those sources. GPL-2.0, BUILD and retail legal texts are copied without inventing new grants. Dependency notice/source review remains a publication gate, not an assertion that these three texts cover every component.
- Additional bundled native-source components to retain in that notice/source review: Nuked OPL3 (`source/audiolib/src/opl3.cpp`, GPL-2.0), TinySoundFont (`tsf.h`, MIT), Ken's KPLIB (`source/build/src/kplib.cpp`), libfixmath (`fix16*`), smmalloc (`smmalloc*`, MIT), loguru (`loguru.*`), RSA Data Security MD4 (`md4.cpp`), ENet (`enet.h`) and Dear ImGui (`source/imgui`). Some optional/dead code is excluded or stripped by this build; this conservative source-component checklist does not claim all those optional features execute. Do not omit their notices from the corresponding source based only on inactive runtime features. The Emscripten native library/libc/toolchain dependencies retain their original terms. No source dependency has been replaced by packaging.
- `vendor/virtual-gamepad/*`: virtual-gamepad 0.3.3, Kyle W-M, MIT. Five JS modules, base CSS and two adapted controller SVG layouts; existing `LICENSE` and `NOTICE.md` retained. No package manager is used at runtime.
- `vendor/sha256.min.js`: js-sha256 0.11.1, Chen, Yi-Cyuan, MIT. Upstream versioned source: https://github.com/emn178/js-sha256/tree/v0.11.1 ; license in `vendor/sha256.LICENSE.txt`. Incremental hashing avoids another complete package-sized WebCrypto input copy. SHA-256 is integrity checking, not encryption or proof of distribution rights.
- Remaining frontend JS/HTML/CSS: existing project Phase 9 frontend plus this project's static bootstrap, scoped isolation worker and content loader. The isolation worker uses the same standards-based header-response technique reviewed in https://github.com/gzuidhof/coi-serviceworker ; it is a project-specific implementation, not a vendored copy of that library. No Carrion/Timespinner code, .NET runtime or game data is included.

## Game content

- Only the owned installation's unchanged `fury.grp` and matching `fury.grpinfo` are packed. This is the Aftershock archive containing Capital Offense and DLC: 2,304 internal ZIP entries, including `scripts/main.con`, `ashock.def`, original `maps/z1a1.map` and DLC `maps/dlc/01_city_1.map`, and the existing audiovisual/script content. No extraction, conversion, recompression or selected-map subset is used.
- `/fury.cfg` is generated at runtime from the existing project defaults, not copied from a player's machine. Save files, personal settings, Steam/GOG DLLs, `.exe`, hidden duplicate archives, storefront metadata, debug logs and certificates are excluded.
- The original retail `legal.txt` is copied to `licenses/retail-legal.txt` as inventory evidence, not as a substitute for the user's final notices or permission documentation.

`FILE_INVENTORY.json` lists every other staged file, byte count and SHA-256 (excluding that inventory's own recursive checksum). It also inventories every content chunk. The following original-file hashes describe logical members of those chunks, not extra loose copies.

## Exact packaged game files

- `fury.grp`: 160826590 bytes; SHA-256 `33d8f414d2ca92044c033d0986d107131fcb94810ec201992b4485c804e80eeb`.
- `fury.grpinfo`: 183 bytes; SHA-256 `0f05ce72b35a2ddfd757d592686e9b54edfc0017b187e8f9b50fa27690b28270`.
