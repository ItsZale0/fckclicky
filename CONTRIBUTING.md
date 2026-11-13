# Contributing to FckClicky

Thanks for your interest in contributing.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies: `npm install`
3. Run in development: `npm start` (or `npx electron .`)

## Development notes

- **Platform:** primarily Windows (Electron + WinUI/Fluent-styled UI, NSIS packaging).
- **Runtime config:** stored outside the repo at `%LOCALAPPDATA%\FckClicky\config.json` (do not commit secrets).
- **Build:** `npm run dist` produces `dist/FckClicky Setup <version>.exe`.
- Keep changes consistent with existing style and structure (`main.js`, `preload.js`, `renderer/*`).

## Pull requests

- Keep PRs focused and describe the motivation and testing performed.
- Do not include unrelated asset bundles, binaries, or secrets.
- Ensure `node -c main.js preload.js renderer/app.js renderer/setup.js` passes.

## Licensing

By contributing, you agree that your contributions will be licensed under the repository’s **GNU GPL-3.0-only** license (`LICENSE`). Only submit code/assets you have the right to license under GPL-3.0.