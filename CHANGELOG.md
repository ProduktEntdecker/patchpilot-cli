# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-08-06

### Added

**Update commands are vetted like installs**

`npm`/`pnpm` `update|up|upgrade`, `yarn upgrade|up` (Classic and Berry),
`bun update` and `poetry update` now go through the full OSV + registry-signal
pipeline. Update commands re-resolve semver ranges and can pull a freshly
poisoned release — `npm update <pkg>` was the ChainDrop worm's primary direct
vector (August 2026) and previously bypassed the parser entirely. Bare updates
(no package named) remain out of scope by construction; see the transitive
plan below.

**ChainDrop regression suite**

`src/chaindrop.test.ts` permanently reconstructs npm's registry state from the
ChainDrop attack window relative to the test clock (keyv@6.0.0 tagged latest,
two hours old, declaring the worm's `preinstall` dropper, zero OSV data) and
asserts that the unmodified pipeline hard-blocks the install, pinned-install
and update vectors via the version-quarantine + install-script combination
rule — inside the zero-day window, before any advisory exists. The suite also
documents the honest limits (`npm ci`, bare installs) as tests.

**Transitive-coverage design evaluation**

`plans/transitive-dependency-coverage.md` evaluates how to close the
transitive gap — ChainDrop's dominant infection path, which no command-line
parser can see. Lockfile-diff checking is the selected approach; `npm ci`
needs a pre-execution lockfile scan instead. Implementation targeted for the
next minor release.

### Fixed

**Option values are no longer mistaken for package names**

Values of value-taking flags (`npm update --omit dev`,
`--workspace packages/a`, yarn `--scope`/`--pattern`, poetry
`--with`/`--without`, pip `-r requirements.txt`) are no longer parsed as
packages. The flag tables are per package manager — npm's `--workspace`
takes a value while pnpm's is boolean — and deliberately conservative: a
missing flag over-checks (harmless false positive), a wrong entry would skip
a real package.

## [0.4.0] - 2026-06-28

### Added

**Known-malware blocking (OSV `MAL-*`)**

OSV advisories from the OpenSSF malicious-packages catalog (`MAL-*` ids)
usually carry no CVSS score. Previously they collapsed through
`UNKNOWN → NONE → allow`, so packages OSV explicitly flags as malware were
installed with a reassuring message. They are now treated as `CRITICAL`
(checked on the raw advisory id and aliases), and any unscored `UNKNOWN`
advisory escalates to `ask` instead of silently passing.

**Typosquat detection (offline)**

Install names are compared against an embedded curated list of popular
npm/PyPI packages using bounded Damerau-Levenshtein distance (transpositions
like `lodahs` count as one edit). Near-misses raise a signal with a
"Did you mean …?" hint. Runs entirely offline — no extra latency, no new
failure mode.

**Install-script detection (npm)**

Packages that run `preinstall`/`install`/`postinstall` lifecycle scripts —
the execution vector for most npm malware — now raise a supply chain signal.
The full registry document already carries each version's scripts, so no
extra request is made.

**Signal combination rules**

Individually weak supply chain signals are now hard-**blocked** when they
form a fresh-malware profile: new package + install script, new package +
low downloads, version quarantine + install script, or typosquat + install
script. Single signals still return `ask`; CVE decisions still take priority.

**Trusted-package allowlist + clean-result cache (`~/.patchpilot.json`)**

- `allowlist` (exact name or `@scope/*` prefix) skips the supply-chain
  heuristics but never the OSV CVE/malware check — an allowlist can never
  unblock known-malicious code.
- Clean `allow` results for an exact `name@version` are cached (24h default),
  cutting latency on repeat installs and preventing fail-closed blocks during
  brief OSV outages. Only `allow` is cached; `deny`/`ask` are always
  re-evaluated and unversioned (`latest`) refs are never cached.
- Config is zod-validated and fail-safe: a malformed file is ignored with a
  warning rather than blocking installs.

### Changed

- PyPI package names are normalized per PEP 503 (lowercase, collapse runs of
  `-`/`_`/`.`) before OSV and registry lookups, so `Django` and
  `python_dateutil` resolve to their canonical project names. npm names are
  left untouched.

### Fixed

- Packaging: the `files` allowlist now includes `dist/**` subdirectories, so
  the embedded popular-packages data ships in the published tarball.

## [0.3.1] - 2026-04-19

### Fixed

**False positives on `npx <tool>` and other unversioned package references**

When a package was referenced without a version (e.g. `npx vite`,
`npx playwright install chromium`), PatchPilot queried OSV without a
version field. OSV returns vulnerabilities across **all versions ever
published** in that case, surfacing patched CVEs as active threats.

Real-world impact before the fix:
- `vite@latest` reported with 5 HIGH vulnerabilities — `vite@8.0.8` (current latest) has 0
- `playwright@latest` reported with 1 HIGH — `playwright@1.59.1` has 0

Fix: when no version is specified, resolve `latest` from the npm or PyPI
registry first, then query OSV with that concrete version. On registry
failure (404, timeout, network error), falls back to the previous
unversioned query — preserves fail-closed behavior for unknown packages.

The resolved version now appears in the hook output (`vite@8.0.8` instead
of misleading `vite@latest`).

Closes #19, #21.

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
