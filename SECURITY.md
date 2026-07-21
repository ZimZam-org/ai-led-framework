# Security Policy

## Supported versions

The latest published `0.x` release on npm receives security fixes. As the project is
pre-1.0, only the most recent minor version is supported.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older        | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately using GitHub's
[Private vulnerability reporting](https://github.com/ZimZam-org/ai-led-framework/security/advisories/new)
("Security" tab → "Report a vulnerability").

Please include:

- a description of the vulnerability and its impact;
- steps to reproduce (or a proof of concept);
- affected version(s) and environment.

We will acknowledge your report within **5 business days** and aim to provide a
resolution or mitigation timeline within **30 days**.

## Scope

This project is an installer CLI that writes template files into a target project.
Of particular interest:

- path traversal or arbitrary file write during `init`;
- template injection via placeholders or CLI arguments;
- any code that would execute untrusted input.

Thank you for helping keep the project and its users safe.
