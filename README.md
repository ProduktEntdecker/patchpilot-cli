# PatchPilot

[![npm version](https://img.shields.io/npm/v/patchpilot)](https://www.npmjs.com/package/patchpilot)
[![npm downloads](https://img.shields.io/npm/dm/patchpilot)](https://www.npmjs.com/package/patchpilot)
[![license](https://img.shields.io/npm/l/patchpilot)](https://github.com/ProduktEntdecker/patchpilot-cli/blob/main/LICENSE)
[![Node.js](https://img.shields.io/node/v/patchpilot)](https://nodejs.org)

Security scanner for vibe coders. Automatically checks npm, pip, and brew packages for vulnerabilities **and** supply chain risks before Claude Code installs them.

## How It Works

PatchPilot is a Claude Code **pre-execution hook** that intercepts install commands and runs two checks in parallel:

```text
You: "install lodash for me"
         ↓
Claude: "npm install lodash@4.17.0"
         ↓
PatchPilot: ┌─ OSV database (known CVEs)
            └─ Registry metadata (supply chain signals)
         ↓
BLOCKED: 4 vulnerabilities found (1 critical, 3 high)
```

### Supply Chain Protection

After the [Axios supply chain attack](https://www.a16z.news/p/et-tu-agent-did-you-install-the-backdoor) (March 2026), where a hijacked maintainer account injected a brand-new malicious dependency, PatchPilot now detects:

| Check | What it catches | Threshold |
|-------|----------------|-----------|
| **Version Quarantine** | Recently published versions — suggests previous stable release | < 72 hours old |
| **New Package Detection** | Brand-new packages with no history | < 7 days old |
| **Low Downloads** | Packages with no community adoption (npm only) | < 100/week |
| **Typosquat Detection** | Names 1–2 edits away from popular packages (`lodahs` → `lodash`) | offline, curated list |
| **Install Scripts** | Packages that run `preinstall`/`install`/`postinstall` on install (npm only) | any lifecycle script |

These would have caught `plain-crypto-js`, the malicious package used in the Axios attack.

A single supply chain signal returns `ask` — you decide whether to proceed. But high-risk **combinations** are blocked outright: a brand-new package that also runs install scripts (or has near-zero downloads), a just-published version with install scripts, or a likely typosquat with install scripts. CVE-based blocks remain automatic.

## Installation

```bash
npm install -g patchpilot
```

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "patchpilot",
        "timeout": 10
      }]
    }]
  }
}
```

Or use npx (no global install):

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "npx patchpilot",
        "timeout": 15
      }]
    }]
  }
}
```

## Configuration

PatchPilot works with zero configuration. To tune it, create `~/.patchpilot.json` (override the path with `PATCHPILOT_CONFIG`):

```json
{
  "allowlist": ["@types/*", "@myorg/*", "lodash"],
  "cache": { "enabled": true, "ttlHours": 24 }
}
```

- **`allowlist`** — packages you trust. Allowlisted packages skip the supply-chain heuristics (quarantine, new-package, low-downloads, typosquat, install-script) but are **still checked against OSV for known CVEs and malware** — an allowlist can never unblock a known-malicious package. Entries match an exact name or a trailing-`*` prefix (e.g. `@types/*`).
- **`cache`** — clean results for an exact `name@version` are cached (default 24h) so repeat installs skip the network round-trip. Only `allow` results are cached; `deny`/`ask` are always re-evaluated, and unversioned (`latest`) references are never cached. The cache lives in `~/.cache/patchpilot/` (override with `PATCHPILOT_CACHE_DIR`). This also keeps installs flowing if the OSV API is briefly unreachable.

A malformed config file is ignored with a warning rather than blocking installs.

## What It Detects

### Package Managers

| Ecosystem | Commands |
|-----------|----------|
| **npm** | `npm install`, `npm i`, `npm add`, `pnpm install`, `pnpm add`, `yarn add`, `bun add`, `bun install` |
| **Python** | `pip install`, `pip3 install`, `pipx install`, `poetry add`, `uv pip install`, `python -m pip install` |
| **Homebrew** | `brew install`, `brew reinstall`, `brew upgrade` (note: no vulnerability data available) |

### Execution Commands

Also detects packages run via:
- `npx <package>`
- `bunx <package>`
- `npm exec <package>`

### Bypass Prevention

Detects packages even when hidden behind:

```bash
# Command wrappers
sudo npm install evil-pkg
env npm install evil-pkg
timeout 60 npm install evil-pkg

# Command chaining
cd /tmp && npm install evil-pkg
true; pip install evil-pkg

# Nested shells
bash -c "npm install evil-pkg"

# Environment variables
NODE_ENV=production npm install evil-pkg
```

## Decision Logic

| Source | Severity | Action |
|--------|----------|--------|
| **Malware** | Known malicious package (OSV `MAL-*`) | **Block** — requires manual approval |
| **CVE** | CRITICAL or HIGH | **Block** — requires manual approval |
| **CVE** | MODERATE or unscored (UNKNOWN) | **Ask** — you decide |
| **CVE** | LOW | **Allow** — with warning |
| **Supply Chain** | High-risk combination (e.g. new package + install scripts) | **Block** — requires manual approval |
| **Supply Chain** | Single signal: version < 72h / new package / low downloads / typosquat / install scripts | **Ask** — you decide |
| None found | — | **Allow** |

Supply chain checks run in parallel with CVE checks (low added latency) and fail-open — if the registry is unreachable, installs proceed normally.

## Accuracy

When you reference a package without a version (e.g. `npx vite`, `npm install lodash`),
PatchPilot resolves the current `latest` from the npm or PyPI registry before querying
OSV. This avoids surfacing patched CVEs from older versions as if they affected the
release you're about to install.

If the registry lookup fails (timeout, 404, network error), PatchPilot falls back to
querying OSV without a version — preserving fail-closed behavior for unknown packages.

## Limitations

- **Homebrew**: OSV has no vulnerability database for Homebrew packages. Brew commands are detected but not checked.
- **Private registries**: Only public npm and PyPI packages are checked.
- **Offline**: Requires internet connection to query OSV API and package registries.
- **Zero-day CVEs**: Supply chain heuristics catch suspicious metadata patterns, but cannot detect all novel attack vectors.
- **Local `npx <tool>`**: PatchPilot treats `npx <tool>` as a potential install. If the tool is already installed in `./node_modules/.bin/`, npx runs the local copy and nothing is downloaded — but the OSV check still runs against the latest published version.

## Development

```bash
# Clone
git clone https://github.com/ProduktEntdecker/patchpilot-cli.git
cd patchpilot-cli

# Install
npm install

# Test
npm test

# Build
npm run build

# Test locally
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm install lodash"}}' | npx tsx src/index.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please report security vulnerabilities privately - see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) - use it however you want.

## Credits

- [OSV](https://osv.dev/) - Open Source Vulnerabilities database by Google
- [shell-quote](https://github.com/substack/node-shell-quote) - Shell command parsing
