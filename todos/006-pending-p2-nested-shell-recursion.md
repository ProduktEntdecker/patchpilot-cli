---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, security, bypass]
dependencies: ["005"]
---

# Triple-Nested Shell Commands Bypass

## Problem Statement

The `parseNestedCommand` function only handles ONE level of shell nesting. Double or triple nested commands bypass detection.

## Findings

**Source:** security-sentinel agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 42-49

**Evidence:**
```bash
# This bypasses detection:
bash -c "bash -c \"npm install hidden\""  # Only outer bash parsed
```

## Proposed Solutions

### Option A: Recursive Parsing (Recommended)
Parse nested commands recursively until no more nesting found.

**Pros:** Complete coverage
**Cons:** Need recursion depth limit
**Effort:** Small
**Risk:** Low

```typescript
function parseNestedCommand(args: string[], depth = 0): string[][] {
  if (depth > 3) return [args]; // Prevent infinite recursion

  if (isShellBinary(args[0]) && args[1] === '-c' && args.length >= 3) {
    const nested = extractCommands(args.slice(2).join(' '));
    return nested.flatMap(cmd => parseNestedCommand(cmd, depth + 1));
  }
  return [args];
}
```

## Acceptance Criteria

- [ ] Double-nested shell commands detected
- [ ] Recursion depth limited (prevent DoS)
- [ ] Tests added for nested scenarios

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Nesting bypass found |
