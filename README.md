# FckClicky

[![CI](https://github.com/ItsZale0/fckclicky/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsZale0/fckclicky/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

**FOSS is 4ever.**

FckClicky is a local-first Windows screen assistant built with Electron. It provides a compact notch UI, gesture-based screen-area selection, and push-to-talk voice (STT → vision/chat → optional TTS) using your own/private API or local Whisper setup.

> **Platform:** Windows (x64, NSIS installer).  
> **License:** GNU GPL v3.0 — see [`LICENSE`](LICENSE).

## Features

- **Notch assistant UI** (hidden by default): hold `Ctrl+Alt` to activate; auto-hides after idle.
- **Gesture selection:** circle an area on screen (overlay) to capture a region for vision prompts.
- **Push-to-talk voice:** hold-to-talk, release to send (record → STT → model → optional TTS).
- **STT providers:** remote OpenAI-compatible `/audio/transcriptions`, or local **faster-whisper** (SYSTRAN) with assisted setup.
- **WinUI/Fluent-inspired UI:** light/dark/system accent aware, reduced-motion support, motion preference toggle.
- **Settings & setup:** in-app settings flyout and first-run/setup window for STT configuration.
- **Tray behavior:** minimize to tray, clean cancel (`Esc`), always-on-top notch flow.

> **Note:** the previous experimental Draw/3D engine window was removed for open-source provenance/compliance reasons (see [Open source status](#open-source-status--compliance)).

## Requirements

- Windows 10/11 (x64)
- [Node.js](https://nodejs.org/) 20+ (LTS recommended) and npm
- **Local STT (optional, faster-whisper):** Python 3.10+ and ability to install `faster-whisper` (setup helper can assist)
- **Remote mode (optional):** an OpenAI-compatible API endpoint/key (configured in settings)

## Quick start (development)

```bash
git clone https://github.com/ItsZale0/fckclicky.git
cd fckclicky
npm install
npm start
```

Useful debug flag: `HEYCLICKY_DEBUG_SHOW=1` to force the notch visible for inspection.

## Build

```bash
# unpacked app (fast validation)
npm run pack

# NSIS installer
npm run dist
```

Outputs (electron-builder):
- `dist/FckClicky Setup <version>.exe`
- `dist/win-unpacked/`

The installer includes branded assets and the motto **“FOSS is 4ever”** (`build/installer.nsh`, `build/*.bmp`). Code signing is not configured by default.

## Configuration & privacy

- Runtime config is stored **outside the repo** at: `%LOCALAPPDATA%\FckClicky\config.json`
- Local Whisper helper/model data (when used): `%LOCALAPPDATA%\FckClicky\whisper\`
- The app can capture screen regions, record microphone audio, and send data to the endpoints/models **you** configure. Review settings, protect your machine/accounts, and only use trusted services.

## Project structure

- `main.js` — Electron main process (windows, hotkeys/watcher, overlay/notch, IPC, STT/AI orchestration)
- `preload.js` — secure bridge (`window.fckclicky`)
- `renderer/` — UI (`index.html` notch+settings, `setup.html`, `overlay.html`, etc.)
- `assets/` — bundled runtime assets (app icon; `Engine/clicky-three.js`, MIT)
- `build/` — installer branding assets/scripts
- `mockups/` — UI mockups/check screenshots
- `.github/workflows/` — CI

## Open source status & compliance

- Licensed under **GPL-3.0-only** (`LICENSE`).
- Third-party notices: `THIRD_PARTY_NOTICES.md`
- Readiness/remediation notes: `OPEN_SOURCE_READINESS_REPORT.md`

**Cleanup performed for release:** unreferenced/unverified third-party or provenance-unclear assets (brand logos, earcons/sounds/audio/video/voice previews/referral images, renamed fonts) and unverified draw-engine components were removed; the Draw/3D window is disabled. `three.js` (MIT) is retained with its header. Review the report and ensure your use/distribution complies with applicable laws and third-party rights.

## Contributing & security

- See `CONTRIBUTING.md` for development and PR guidelines.
- See `SECURITY.md` for reporting vulnerabilities.

## Disclaimer

This software is provided **“AS IS”**, without warranty (see `LICENSE`). It interacts with your screen, microphone, and configured APIs—use responsibly.

**Not affiliated with or endorsed by HeyClicky** or any third-party service whose APIs you may configure. The name is a playful allusion; ensure your use respects applicable trademark and other rights.