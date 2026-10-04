# Security Policy

## Supported versions

Only the current `main` branch is maintained. There are no versioned releases yet.

## Reporting a vulnerability

Do **not** open a public issue. Email the repository maintainer privately with:

- Affected route/file and version (commit hash).
- Steps to reproduce (without exploiting patient or production data).
- Expected vs actual behavior.

You will receive acknowledgment; fixes are prioritized by impact on authentication, tenant isolation, and
webhook integrity.

## Scope notes

- No HIPAA, SOC 2, GDPR, or medical-device compliance is claimed.
- The security architecture is documented in [docs/SECURITY.md](docs/SECURITY.md); known limitations there
  are tracked, not hidden.
- Demo seeds and dev fallbacks are strictly non-production; never enable them on deployed environments.
