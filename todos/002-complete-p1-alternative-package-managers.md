---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, security, bypass]
dependencies: []
---

# Alternative Package Managers Not Detected

## Problem Statement

The parser only detects npm/npx, pip/pip3, and brew. Modern development commonly uses pnpm, yarn, bun, pipx, poetry, conda, and others. These are completely unprotected.

**Why it matters:** Popular package managers like yarn and pnpm are used in millions of projects. Attackers can simply use an alternative package manager to bypass all security checks.

## Findings

**Source:** security-sentinel agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 83-96

**Evidence:**
```bash
# ALL of these bypass the security check:
pnpm install malicious              # BYPASSED - npm ecosystem
pnpm add malicious                  # BYPASSED
yarn add malicious                  # BYPASSED - npm ecosystem
yarn install malicious              # BYPASSED
bun add malicious                   # BYPASSED - npm ecosystem
bun install malicious               # BYPASSED
python -m pip install malicious     # BYPASSED - pypi ecosystem
python3 -m pip install malicious    # BYPASSED
pipx install malicious              # BYPASSED - pypi ecosystem
uv pip install malicious            # BYPASSED - pypi ecosystem
poetry add malicious                # BYPASSED - pypi ecosystem
conda install malicious             # BYPASSED
gem install malicious               # BYPASSED - rubygems (new ecosystem)
bundle add malicious                # BYPASSED - rubygems
```

## Proposed Solutions

### Option A: Extend detectInstallCommand (Recommended)
Add detection for all common package managers.

**Pros:** Comprehensive protection
**Cons:** Increases code complexity, may need new ecosystems
**Effort:** Medium
**Risk:** Low

```typescript
function detectInstallCommand(args: string[]): DetectResult | null {
  if (args.length < 2) return null;
  const [cmd, subcmd] = args;

  // npm ecosystem (npm, npx, pnpm, yarn, bun)
  if (['npm', 'npx', 'pnpm', 'yarn', 'bun'].includes(cmd)) {
    if (['install', 'i', 'add'].includes(subcmd)) {
      return { ecosystem: 'npm', packageArgs: args.slice(2) };
    }
  }

  // pip ecosystem (pip, pip3, pipx, uv, poetry)
  if (['pip', 'pip3', 'pipx'].includes(cmd) && subcmd === 'install') {
    return { ecosystem: 'pypi', packageArgs: args.slice(2) };
  }
  if (cmd === 'uv' && subcmd === 'pip') {
    // uv pip install pkg
    return { ecosystem: 'pypi', packageArgs: args.slice(3) };
  }
  if (cmd === 'poetry' && subcmd === 'add') {
    return { ecosystem: 'pypi', packageArgs: args.slice(2) };
  }

  // python -m pip install
  if ((cmd === 'python' || cmd === 'python3') && subcmd === '-m') {
    if (args[2] === 'pip' && args[3] === 'install') {
      return { ecosystem: 'pypi', packageArgs: args.slice(4) };
    }
  }

  // homebrew
  if (cmd === 'brew' && ['install', 'reinstall'].includes(subcmd)) {
    return { ecosystem: 'homebrew', packageArgs: args.slice(2) };
  }

  return null;
}
```

### Option B: Plugin Architecture
Allow ecosystem-specific parsers to be registered.

**Pros:** Extensible, clean separation
**Cons:** Over-engineering for current needs
**Effort:** Large
**Risk:** Medium

## Recommended Action
<!-- Fill during triage -->

## Technical Details

**Affected files:**
- `src/parser.ts` - `detectInstallCommand` function
- `src/osv.ts` - May need new ecosystem mapping

**Components impacted:**
- Package manager detection
- OSV API queries (ecosystem mapping)

## Acceptance Criteria

- [ ] pnpm install/add detected (npm ecosystem)
- [ ] yarn add detected (npm ecosystem)
- [ ] bun install/add detected (npm ecosystem)
- [ ] python -m pip install detected (pypi ecosystem)
- [ ] pipx install detected (pypi ecosystem)
- [ ] poetry add detected (pypi ecosystem)
- [ ] Tests added for all package managers

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Major coverage gap found |

## Resources

- PR #7: https://github.com/ProduktEntdecker/patchpilot-cli/pull/7
- OSV API ecosystems: https://ossf.github.io/osv-schema/
