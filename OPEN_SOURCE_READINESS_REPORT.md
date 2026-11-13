# Open source readiness and remediation report

**Date:** 2026-11-13  
**Scope:** `heyclicky-electron-clone/` (FckClicky), post-remediation snapshot  
**Disclaimer:** This is a technical, preliminary report and **not legal advice**.

## Summary

The project has been substantially remediated for open-source publication under **GPL-3.0-only**. Key blocking issues identified earlier (no outbound license, `UNLICENSED` metadata, bundled third-party/provenance-unclear assets, and unverified draw-engine components) have been addressed. Residual considerations remain and are documented below.

## Remediation actions completed

- **Licensing:** Added full GNU GPL v3.0 text in `LICENSE` and set `package.json` / `package-lock.json` to `GPL-3.0-only`.
- **Asset cleanup:** Removed unreferenced and/or provenance-unclear third-party asset bundles previously present in the tree, including third-party brand logos, earcons/sounds, audio, video, voice previews, referral images, and renamed/unverified font copies.
- **Draw engine cleanup:** Removed draw-engine components of unverified provenance (`clicky-draw-engine.js`, `clicky-draw-native.js`, `clicky-draw-pieces.js`, `clicky-three-parts.js`). Replaced `renderer/draw.html` with a safe placeholder and removed draw window/IPC wiring from `main.js`. Core functionality (notch, overlay/selection, voice, settings) is preserved.
- **Retained and attributed:** `assets/Engine/clicky-three.js` (Three.js, MIT) retained with its copyright and license header intact; documented in `THIRD_PARTY_NOTICES.md`. `assets/AppIcon.ico` regenerated as a project asset.
- **Documentation and hygiene:** Added `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, and `.gitignore`. Installer branding assets and scripts are included under `build/`.
- **Repository state:** A cleaned project repository was prepared (suitable for publishing from a fresh history/state).

## Current bundled/runtime asset state

- `assets/AppIcon.ico`
- `assets/Engine/clicky-three.js` (MIT, Three.js)

(Plus `build/` installer resources used at packaging time.)

## Residual considerations

1. **Naming and trademark context:** The project name is a playful allusion to “HeyClicky/Clicky.” Despite cleanup, naming/trade-dress associations may carry trademark or confusion risk depending on jurisdiction and use.
2. **Historical provenance:** The project originated in a reverse-engineering/clone context. Identified risky bundles were removed, but maintainers should ensure all remaining source code is original or properly licensed/cleared. Publishing from a **fresh, clean repository history** is recommended.
3. **Scope of publication:** Only the cleaned project contents should be published; do not include unrelated workspace materials or prior artifacts.
4. **Dependencies:** Electron, electron-builder, and transitive dependencies are governed by their respective licenses. Ensure compliance when distributing source or binaries.
5. **Third-party services:** Use of user-configured STT/LLM/vision/TTS APIs is subject to those providers’ terms and policies.

## Conclusion

- **Before remediation:** not suitable for open-source release without significant legal and compliance risk.
- **After remediation:** suitable for publication as a **GPL-3.0-only** project from a clean state, subject to the residual considerations above. For higher assurance, obtain a qualified legal review.