# FckClicky

**FOSS is 4ever.**

FckClicky is a local-first Windows screen assistant built with Electron. It provides a compact notch UI, gesture-based screen-area selection, push-to-talk voice (STT → vision/chat → optional TTS) using your own/private API or local Whisper setup.

> **Platform:** Windows (NSIS installer target).  
> **License:** GNU GPL v3.0 (see [`LICENSE`](LICENSE)).

## Features

- **Notch assistant UI** (hidden by default): hold `Ctrl+Alt` to activate; auto-hides after idle.
- **Gesture selection:** circle an area on screen (overlay/ribbon) to capture a region for vision prompts.
- **Push-to-talk voice:** hold-to-talk, release to send (record → STT → model → optional TTS).
- **STT providers:** remote OpenAI-compatible `/audio/transcriptions`, or local **faster-whisper** (SYSTRAN) with assisted setup.
- **WinUI/Fluent-inspired UI:** light/dark/system accent aware, reduced-motion support, motion preference toggle.
- **Settings & setup:** in-app settings flyout and first-run/setup window for STT configuration.
- **Tray behavior:** minimize to tray, clean cancel (`Esc`), always-on-top notch flow.

> **Note:** the previous experimental Draw/3D engine window was removed for open-source provenance/compliance reasons (see “Open source status”).

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) (LTS recommended) and npm
- For **local STT (faster-whisper):** Python 3.10+ and ability to install `faster-whisper` (setup helper can assist)
- For **remote STT/chat/vision/TTS:** an OpenAI-compatible API endpoint/key (as configured in settings)

## Development

```bash
npm install
npm start
# or
npx electron .
```

Debug helpers (as used during development):
- `HEYCLICKY_DEBUG_SHOW=1` to force the notch visible for inspection.

## Build (Windows installer)

```bash
npm run dist
```

Outputs (electron-builder, NSIS, x64):
- `dist/FckClicky Setup <version>.exe`
- `dist/win-unpacked/`

The installer is customized with branded assets and the motto **“FOSS is 4ever”** (`build/installer.nsh`, `build/*.bmp`).

## Configuration & data

- Runtime config is stored outside the repo at:  
  `%LOCALAPPDATA%\FckClicky\config.json`
- Local Whisper helper/model paths (when used) live under `%LOCALAPPDATA%\FckClicky\whisper\` (as configured).

## Project structure (high level)

- `main.js` — Electron main process (windows, hotkeys/watcher, overlay/notch, IPC, STT/AI orchestration)
- `preload.js` — secure bridge (`window.fckclicky`)
- `renderer/` — UI (`index.html` notch+settings, `setup.html`, `overlay.html`, etc.)
- `assets/` — bundled runtime assets (app icon; `Engine/clicky-three.js` MIT)
- `build/` — installer branding assets/scripts
- `mockups/` — UI mockups/check screenshots

## Open source status & compliance

- Licensed under **GPL-3.0-only**. See [`LICENSE`](LICENSE).
- Third-party bundled material and notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Readiness/remediation report: [`OPEN_SOURCE_READINESS_REPORT.md`](OPEN_SOURCE_READINESS_REPORT.md).

**Cleanup performed for release:** unreferenced/unverified third-party or provenance-unclear assets (brand logos, earcons/sounds/audio/video/voice previews/referral images, renamed fonts) and unverified draw-engine components were removed; the Draw/3D window is disabled. `three.js` (MIT) is retained with its header. Please review the report and ensure your use/distribution complies with applicable laws and third-party rights.

## Contributing

Issues and pull requests are welcome. By contributing, you agree that your contributions are licensed under the project’s GPL-3.0-only license.

## Disclaimer

This software is provided **as is**, without warranty. It interacts with your screen, microphone, and configured APIs—review settings and use responsibly. Not affiliated with or endorsed by HeyClicky or any third-party service whose APIs you may configure.