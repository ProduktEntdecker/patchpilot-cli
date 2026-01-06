# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in PatchPilot, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email the maintainer directly or use GitHub's private vulnerability reporting
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release

## Security Best Practices for Users

1. **Keep PatchPilot updated** - Run `npm update patchpilot` regularly
2. **Review blocked packages** - Understand why a package was flagged
3. **Report bypasses** - If you find a way to bypass detection, please report it

## Known Limitations

- **Homebrew**: No vulnerability database available (OSV doesn't support Homebrew)
- **Private registries**: Only public npm/PyPI packages are checked
- **Version ranges**: Only exact versions are checked; `latest` checks the latest published version

## Scope

This security policy covers:
- The PatchPilot npm package
- The command parsing logic
- The OSV API integration

Out of scope:
- The OSV database itself
- Claude Code's hook system
- Third-party dependencies (report to their maintainers)
