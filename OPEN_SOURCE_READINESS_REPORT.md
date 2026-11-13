# FckClicky — open source readiness / remediation report

**Date:** 2026-11-13 (workspace)  
**Scope:** `heyclicky-electron-clone/` (FckClicky) after cleanup/remediation pass.  
**Note:** technical/preliminary report, **not legal advice**.

## Status summary

**Significantly remediated and prepared for open-source publication under GPL-3.0**, with residual items to keep in mind. Compared to the initial state, major blocking issues (no license, UNLICENSED metadata, bundled third-party/provenance-unclear assets, unverified draw engine) were addressed.

## Actions taken (remediation)

- **License added:** full `LICENSE` (GNU GPL v3.0). `package.json` / `package-lock.json` set to `GPL-3.0-only` (metadata aligned).
- **Unverified / third-party-risk assets removed** (no longer bundled/referenced by core app): `assets/Logos/` (third-party brand/trademark logos), `assets/Earcons/`, `assets/Sounds/`, `assets/VoicePreviews/` (Gemini/OpenAI-branded voice previews), `assets/Video/`, `assets/Audio/`, `assets/Referral/`, `assets/Fonts/` (renamed/unverified font copies).
- **Draw/3D engine provenance cleanup:** removed `clicky-draw-engine.js`, `clicky-draw-native.js`, `clicky-draw-pieces.js`, `clicky-three-parts.js` (unverified provenance). `draw.html` replaced with a safe placeholder; draw window/IPC removed from `main.js`. Core features (notch, overlay/selection, voice, settings) unaffected.
- **Retained and attributed:** `assets/Engine/clicky-three.js` (Three.js, **MIT**, copyright/license header preserved) — documented in `THIRD_PARTY_NOTICES.md`. `assets/AppIcon.ico` replaced with a newly generated icon.
- **Notices & docs:** `THIRD_PARTY_NOTICES.md`, `README.md`, `.gitignore` added; installer branded (including motto) and rebuilt.
- **Packaging:** `package.json` still includes `assets/**/*` but the `assets/` tree now contains only `AppIcon.ico` and `Engine/clicky-three.js`.

## Remaining considerations (not fully “zero risk”)

1. **Name/history:** “FckClicky” intentionally alludes to/mock “HeyClicky/Clicky”. Even with cleanup, name/trade-dress associations can carry trademark/confusion risk depending on use/jurisdiction.
2. **Prior derivation/reverse-engineering context:** project originated as a clone/reverse-engineering exercise. This cleanup removed identified risky bundles, but you should ensure all remaining source logic you publish is authored by you or properly licensed/cleared. (Publishing a **fresh repository** without carrying over prior history/artifacts is recommended.)
3. **Parent workspace artifacts:** the larger workspace (outside this folder) contains reverse-engineering materials; do not publish them. The private GitHub repo should be created from this cleaned folder only.
4. **Dependencies at build/runtime:** Electron/electron-builder and transitive deps have their own licenses; comply via upstream notices/lockfile. Review if you redistribute binaries.
5. **APIs/models you configure:** use of third-party STT/LLM/vision/TTS services is subject to their terms; not a repo licensing issue but relevant to users.

## Practical conclusion

- **Before cleanup:** not publishable as open source without significant legal risk.
- **After cleanup:** suitable to publish as a **GPL-3.0** project from a **fresh, clean repo state**, provided you accept/address the residual considerations above (especially naming/trademark context and ensuring remaining code provenance). For higher assurance, obtain a legal review.