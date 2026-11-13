# Security Policy

## Supported versions

This project is provided as-is. Security fixes, when available, are applied to the latest state of the default branch and releases.

## Reporting a vulnerability

If you discover a security issue, **please do not open a public issue** with exploit details.

- Use GitHub’s private vulnerability reporting for this repository if enabled.
- Otherwise, contact the repository maintainer privately with: a description, impact, reproduction steps, and any suggested fix.

We will acknowledge reports when possible and work on a remediation.

## Scope notes

FckClicky can access the screen, microphone, local files/paths you configure, and network endpoints/APIs you configure (STT/LLM/vision/TTS). Review your configuration and only use trusted endpoints and models. Runtime secrets/config are stored locally (e.g. `%LOCALAPPDATA%\FckClicky\config.json`)—protect your machine and accounts accordingly.