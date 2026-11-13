# Third-party notices

This document lists third-party material bundled in this repository and/or included in distributed builds.

## Bundled in repository

### Three.js (MIT)

- **Path:** `assets/Engine/clicky-three.js`
- **Project:** [Three.js](https://threejs.org/)
- **License:** MIT
- **Copyright:** Copyright © 2010-2026 Three.js Authors
- **SPDX-License-Identifier:** MIT

The original copyright and license header is preserved in the source file. The full MIT license text is available from the Three.js project and at <https://opensource.org/license/mit>.

## Development and packaging dependencies

- **Electron** and **electron-builder** (and transitive dependencies) are used for development, packaging, and runtime distribution as defined in `package.json` / `package-lock.json`. These components are governed by their respective licenses; consult the upstream projects and installed package metadata for complete license texts and notices.

## Project-generated assets

- `assets/AppIcon.ico` and installer resources in `build/` were generated for this project and are covered by this repository’s license unless otherwise stated.

## Removed materials

During open-source readiness remediation, previously included unverified or provenance-unclear third-party asset bundles and draw-engine components were removed (including third-party brand logos, audio/earcon/sound/video/voice-preview/referral assets, renamed font copies, and unverified draw-engine sources). The Draw/3D feature is currently a placeholder pending a clean reimplementation (see project roadmap). For context, refer to `OPEN_SOURCE_READINESS_REPORT.md`.