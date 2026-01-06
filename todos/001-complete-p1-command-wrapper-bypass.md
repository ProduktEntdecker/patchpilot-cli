---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security, bypass]
dependencies: []
---

# Command Wrapper Bypass Vulnerability

## Problem Statement

The parser only detects direct package manager commands but fails to detect commands prefixed with wrappers like `env`, `sudo`, `exec`, `eval`, etc. This allows trivial bypass of the security check.

**Why it matters:** An attacker can completely bypass vulnerability checking with a single prefix like `env npm install malicious`.

## Findings

**Source:** security-sentinel agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 77-99

**Evidence:**
```bash
# ALL of these bypass the security check:
env npm install malicious           # BYPASSED
sudo npm install malicious          # BYPASSED
command npm install malicious       # BYPASSED
exec npm install malicious          # BYPASSED
eval npm install malicious          # BYPASSED
nice npm install malicious          # BYPASSED
timeout 60 npm install malicious    # BYPASSED
nohup npm install malicious         # BYPASSED
```

## Proposed Solutions

### Option A: Recursive Command Unwrapping (Recommended)
Strip known wrapper commands before detecting install commands.

**Pros:** Comprehensive, handles nested wrappers
**Cons:** Needs maintenance as new wrappers emerge
**Effort:** Medium
**Risk:** Low

```typescript
const COMMAND_WRAPPERS = new Set([
  'env', 'sudo', 'doas', 'exec', 'eval', 'command', 'builtin',
  'nice', 'ionice', 'nohup', 'timeout', 'strace', 'time'
]);

function unwrapCommand(args: string[]): string[] {
  while (args.length > 0 && COMMAND_WRAPPERS.has(args[0])) {
    args = args.slice(1);
    // Handle flags like `sudo -u root`
    while (args.length > 0 && args[0].startsWith('-')) {
      args = args.slice(args[0] === '-u' ? 2 : 1);
    }
  }
  return args;
}
```

### Option B: Regex Pattern Matching
Use regex to find install commands anywhere in token list.

**Pros:** Simple implementation
**Cons:** Less precise, may have false positives
**Effort:** Small
**Risk:** Medium

## Recommended Action
<!-- Fill during triage -->

## Technical Details

**Affected files:**
- `src/parser.ts` - `detectInstallCommand` function

**Components impacted:**
- Security bypass detection

## Acceptance Criteria

- [ ] `env npm install malicious` is detected and blocked
- [ ] `sudo npm install malicious` is detected and blocked
- [ ] `timeout 60 npm install pkg` is detected and blocked
- [ ] Nested wrappers like `sudo env npm install` are handled
- [ ] Tests added for all wrapper variants

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Critical security bypass found |

## Resources

- PR #7: https://github.com/ProduktEntdecker/patchpilot-cli/pull/7
- Security review findings
