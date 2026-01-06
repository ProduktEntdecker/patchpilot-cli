# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2024-01-06

### Security - Critical Fixes from Security Audit

**BREAKING: Fail-closed behavior on network errors**
- Previously: Network errors returned "no vulnerabilities" (DANGEROUS)
- Now: Network errors deny the install with clear message

**Parser bypass fixes:**
- Full path commands now detected (`/usr/bin/npm`, `~/.nvm/.../npm`)
- `npx -p <pkg>` and `--package=<pkg>` flags now scanned (not just the executable)
- `npm link`, `yarn link`, `bun link` commands now detected
- `eval "npm install ..."` with quoted strings now parsed
- 16 additional command wrappers added (caffeinate, watch, xargs, proxychains, etc.)

### Changed
- OSV API calls now run in parallel (O(1) instead of O(n) for multiple packages)
- Reduced per-request timeout from 8s to 4s to fit within hook budget
- Removed `any` type usage for better type safety
- Added `CheckResult` type to distinguish success vs error

### Added
- 20 new security tests for bypass prevention
- Total test count: 87

## [0.2.0] - 2024-01-06

### Added
- Shell-aware command parsing using `shell-quote` library
- Support for command wrappers: `env`, `sudo`, `exec`, `nohup`, `timeout`, etc.
- Support for alternative package managers:
  - npm ecosystem: `pnpm`, `yarn`, `bun`
  - Python ecosystem: `pipx`, `poetry`, `uv`, `python -m pip`
  - Homebrew: `brew reinstall`, `brew upgrade`
- Detection of `npx`, `bunx`, and `npm exec` execution (not just installs)
- Nested shell command detection (`bash -c "npm install..."`)
- Command chaining detection (`&&`, `||`, `;`, `|`)
- Environment variable prefix handling (`NODE_ENV=prod npm install`)
- Honest messaging for Homebrew (no vulnerability database available)
- 67 comprehensive tests for parser

### Security
- Fixed bypass via command wrappers (env, sudo, exec)
- Fixed bypass via alternative package managers
- Fixed bypass via npx/bunx execution
- Fixed bypass via command chaining
- Fixed bypass via nested shell commands

## [0.1.0] - 2024-01-05

### Added
- Initial release
- Basic npm, pip, brew install detection
- OSV (Open Source Vulnerabilities) database integration
- Claude Code PreToolUse hook integration
- Decision engine for vulnerability severity assessment
