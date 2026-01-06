---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, typescript, quality]
dependencies: []
---

# Naming Convention Violations

## Problem Statement

Several variables and constants violate naming conventions and the "5-second rule" (should understand purpose within 5 seconds).

## Findings

**Source:** kieran-typescript-reviewer agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`

**Evidence:**
1. Line 18: `current` - Current *what*?
2. Line 22: Inline array `['&&', '||', ';', '|']` - Magic strings
3. Line 44: `shellBinaries` defined inside function - Should be module constant

## Proposed Solutions

### Option A: Fix All Naming Issues (Recommended)

```typescript
// Module-level constants
const COMMAND_SEPARATING_OPERATORS = new Set(['&&', '||', ';', '|']);
const SHELL_BINARIES = new Set(['bash', 'sh', 'zsh', '/bin/bash', '/bin/sh', '/bin/zsh']);

// In extractCommands:
let currentCommandTokens: string[] = [];

// In operator check:
if (COMMAND_SEPARATING_OPERATORS.has(token.op)) { ... }
```

## Acceptance Criteria

- [ ] `current` renamed to `currentCommandTokens`
- [ ] Operators extracted to `COMMAND_SEPARATING_OPERATORS` constant
- [ ] Shell binaries moved to module-level `SHELL_BINARIES` constant
- [ ] All tests still pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Naming issues found |
