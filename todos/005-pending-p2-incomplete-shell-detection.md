---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, security, bypass]
dependencies: []
---

# Incomplete Shell Binary Detection

## Problem Statement

The shell binary list for detecting nested commands is incomplete. It misses common shell paths and alternative shells, allowing bypass via `ksh -c`, `dash -c`, or `/usr/bin/bash -c`.

## Findings

**Source:** security-sentinel agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 44-48

**Evidence:**
```typescript
// Current list:
const shellBinaries = ['bash', 'sh', 'zsh', '/bin/bash', '/bin/sh', '/bin/zsh'];

// These bypass detection:
'/usr/bin/bash -c "npm install pkg"'     # BYPASSED
'/usr/local/bin/bash -c "npm install"'   # BYPASSED
'ksh -c "npm install pkg"'               # BYPASSED
'dash -c "npm install pkg"'              # BYPASSED
'fish -c "npm install pkg"'              # BYPASSED
```

## Proposed Solutions

### Option A: Use Basename Matching (Recommended)
Extract basename from path and match against shell names.

**Pros:** Handles all paths to known shells
**Cons:** Slightly more complex
**Effort:** Small
**Risk:** Low

```typescript
const SHELL_NAMES = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash', 'csh', 'tcsh', 'fish']);

function isShellBinary(cmd: string): boolean {
  const basename = cmd.split('/').pop() || '';
  return SHELL_NAMES.has(basename);
}
```

### Option B: Expand Static List
Add more paths to the existing list.

**Pros:** Simple
**Cons:** Never complete, maintenance burden
**Effort:** Small
**Risk:** Medium

## Acceptance Criteria

- [ ] `/usr/bin/bash -c` detected
- [ ] `/usr/local/bin/zsh -c` detected
- [ ] ksh, dash, fish detected
- [ ] Tests added for shell variants

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Shell detection gaps found |
