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

All three would have caught `plain-crypto-js`, the malicious package used in the Axios attack.

Supply chain checks return `ask` (not `deny`) — you decide whether to proceed. CVE-based blocks remain automatic.

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
| **CVE** | CRITICAL or HIGH | **Block** — requires manual approval |
| **CVE** | MODERATE | **Ask** — you decide |
| **CVE** | LOW | **Allow** — with warning |
| **Supply Chain** | Version < 72h / New package / Low downloads | **Ask** — you decide |
| None found | — | **Allow** |

Supply chain checks run in parallel with CVE checks (low added latency) and fail-open — if the registry is unreachable, installs proceed normally.

## Limitations

- **Homebrew**: OSV has no vulnerability database for Homebrew packages. Brew commands are detected but not checked.
- **Private registries**: Only public npm and PyPI packages are checked.
- **Offline**: Requires internet connection to query OSV API and package registries.
- **Zero-day CVEs**: Supply chain heuristics catch suspicious metadata patterns, but cannot detect all novel attack vectors.

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
