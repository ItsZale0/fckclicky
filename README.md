# FckClicky

[![CI](https://github.com/ItsZale0/fckclicky/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsZale0/fckclicky/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

FckClicky is a local-first Windows screen assistant built with Electron. It provides a compact notch interface, gesture-based screen-area selection, and push-to-talk voice interaction (speech-to-text → vision/chat → optional text-to-speech), using either a private/OpenAI-compatible API or a local faster-whisper setup.

> **Platform:** Windows 10/11 (x64)

## Overview

FckClicky is designed to stay out of the way until needed:
- The notch remains hidden by default and appears when activated.
- Hold **Ctrl+Alt** to activate the assistant and use push-to-talk.
- Circle an area on screen to select a region for vision/context.
- Press **Esc** to cancel the current interaction cleanly.

## Features

- **Notch UI** — compact, always-available assistant surface with tray integration.
- **Activation model** — `Ctrl+Alt` hold-to-activate / push-to-talk; idle auto-hide behavior.
- **Screen-area selection** — gesture-based overlay selection (loop/circle) to capture a region.
- **Voice pipeline** — record → STT → chat/vision → optional TTS playback.
- **Speech-to-text options**
  - **Remote:** OpenAI-compatible `/audio/transcriptions` endpoint.
  - **Local:** [faster-whisper](https://github.com/SYSTRAN/faster-whisper) with assisted setup and generated helper script.
- **Settings & setup** — in-app settings flyout and first-run/setup window.
- **UI** — Fluent/WinUI-inspired styling, light/dark and system accent awareness, reduced-motion support and motion preference toggle.

## Requirements

- **Windows 10/11** (x64)
- **Node.js 20+** (LTS recommended) and npm
- **Local STT (optional):** Python 3.10+ and the ability to install `faster-whisper`
- **Remote mode (optional):** an OpenAI-compatible API endpoint and credentials for the services you enable (STT/chat/vision/TTS)

## Installation

### End users
Download the latest Windows installer from [GitHub Releases](https://github.com/ItsZale0/fckclicky/releases).

### From source

```bash
git clone https://github.com/ItsZale0/fckclicky.git
cd fckclicky
npm install
npm start
```

You can also run the app directly with `npx electron .`.

**Debug flag:** `HEYCLICKY_DEBUG_SHOW=1` forces the notch to show for UI inspection.

## Build

```bash
# Unpacked app (faster validation)
npm run pack

# NSIS installer (Windows x64)
npm run dist
```

Build outputs (electron-builder):
- `dist/FckClicky Setup <version>.exe`
- `dist/win-unpacked/`

Code signing is not configured by default.

## Configuration and data

Runtime configuration and local helper data are stored outside the repository:

- **Config:** `%LOCALAPPDATA%\FckClicky\config.json`
- **Local Whisper helper/models (when used):** `%LOCALAPPDATA%\FckClicky\whisper\` (as configured)

Do not commit local configuration or credentials.

## Privacy and security notes

FckClicky can access sensitive capabilities depending on how you use it:
- **Screen capture** (selected regions) for vision/context
- **Microphone input** for push-to-talk
- **Network requests** to the API endpoints you configure

Only use trusted endpoints and models, review your settings, and protect your machine and accounts. For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Project structure

- `main.js` — Electron main process (windows, activation/hotkeys, overlay/notch, IPC, STT/AI orchestration)
- `preload.js` — preload bridge (`window.fckclicky`)
- `renderer/` — UI (`index.html` notch & settings, `setup.html`, `overlay.html`, `draw.html` placeholder, etc.)
- `assets/` — bundled runtime assets (app icon; `Engine/clicky-three.js`)
- `build/` — installer assets/scripts
- `mockups/` — UI mockups and check screenshots
- `.github/workflows/` — CI configuration

## Roadmap

Planned and potential improvements (subject to change):

- **Draw / 3D reimplementation** — replace the removed placeholder with a clean, fully licensed/open implementation for drawing and 3D visualization features.
- **Voice flow hardening** — improved reliability, device handling, and clearer diagnostics across STT/TTS paths.
- **Model/provider UX** — better model discovery, validation, and per-task configuration.
- **Selection & overlay refinements** — improved accuracy, feedback, and accessibility of gesture selection.
- **Packaging & distribution** — signed builds, update strategy, and broader platform evaluation.
- **Testing & quality** — expanded automated checks and end-to-end validation.

## Licensing and third-party notices

- **License:** [GNU GPL v3.0](LICENSE) (`GPL-3.0-only`)
- **Third-party notices:** [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)

This project includes `three.js` (MIT) with its license header preserved. Unverified or provenance-unclear third-party assets and draw-engine components were removed prior to release; the Draw/3D feature is planned for clean reimplementation (see [Roadmap](#roadmap)). Review the license and notices before redistribution or modification.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines. By contributing, you agree that your contributions are licensed under this repository’s GPL-3.0-only license.

## Disclaimer

This software is provided **“AS IS”**, without warranty of any kind. See [`LICENSE`](LICENSE) for details.

FckClicky is an independent project and is **not affiliated with or endorsed by HeyClicky** or any third-party service whose APIs you may configure. The name is a playful allusion; ensure your use and distribution respect applicable trademark and other rights.