# PatchPilot

Security scanner for vibe coders. Automatically checks npm, pip, and brew packages for vulnerabilities before Claude Code installs them.

## How it works

PatchPilot is a Claude Code **pre-execution hook** that intercepts install commands:

```
Agent: "npm install lodash@4.17.0"
         ↓
PatchPilot: Checks OSV database
         ↓
🚨 BLOCKED: 4 vulnerabilities found
   or
✅ Safe - proceeding
```

## Installation

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "npx patchpilot",
        "timeout": 10
      }]
    }]
  }
}
```

## What it protects

- `npm install`, `npm i`, `npm add`
- `pip install`, `pip3 install`
- `brew install`

## Status

🚧 Under development

## License

MIT
