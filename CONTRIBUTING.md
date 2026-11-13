# Contributing to FckClicky

Thank you for your interest in contributing to FckClicky.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the app in development:
   ```bash
   npm start
   ```

## Development guidelines

- **Platform:** Windows (x64) is the primary target (Electron, NSIS packaging).
- **Scope:** Keep pull requests focused and include a clear description of the problem, approach, and testing performed.
- **Consistency:** Follow existing project structure and style (`main.js`, `preload.js`, `renderer/*`).
- **Safety:** Do not commit secrets, personal data, local configuration, build outputs (`dist/`), or `node_modules/`.
- **Assets and licensing:** Only submit code or assets you have the right to contribute and license under this project’s license. Do not add third-party proprietary or uncleared material.

## Validation

Before submitting, run the relevant checks where possible:

```bash
node -c main.js
node -c preload.js
node -c renderer/app.js
node -c renderer/setup.js
npm run pack
```

## Licensing of contributions

By submitting a contribution, you agree that your contributions are licensed under the repository’s **GNU GPL-3.0-only** license (see [`LICENSE`](LICENSE)).