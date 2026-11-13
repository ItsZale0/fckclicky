# Security policy

## Supported versions

Security fixes, when provided, target the latest state of the default branch and current releases.

## Reporting a vulnerability

Please **do not** disclose security vulnerabilities in public issues.

- Prefer GitHub **private vulnerability reporting** for this repository if it is enabled.
- Otherwise, contact the maintainer privately with: a clear description, potential impact, affected components/versions, reproduction steps, and any suggested mitigation.

Reports will be reviewed on a best-effort basis.

## Security considerations

FckClicky may, depending on configuration and use:
- Capture selected screen regions
- Record microphone audio (push-to-talk)
- Read/write local configuration and helper files
- Communicate with user-configured network endpoints (e.g. STT/LLM/vision/TTS APIs)

Recommendations:
- Use only trusted API endpoints, models, and dependencies.
- Protect your workstation and accounts; runtime configuration may contain sensitive values (stored locally outside the repository, e.g. `%LOCALAPPDATA%\FckClicky\config.json`).
- Review and audit changes before building or distributing binaries.