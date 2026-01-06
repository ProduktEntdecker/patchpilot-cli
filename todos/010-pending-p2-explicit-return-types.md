---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, typescript, quality]
dependencies: []
---

# Inconsistent Function Return Type Explicitness

## Problem Statement

Some internal functions lack explicit return types, making the code harder to understand and potentially allowing accidental type changes.

## Findings

**Source:** kieran-typescript-reviewer agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`

**Evidence:**
| Function | Has Return Type |
|----------|-----------------|
| `extractCommands` | No |
| `parseNestedCommand` | No |
| `parsePackagesFromArgs` | No |
| `detectInstallCommand` | Yes |
| `parseInstallCommand` | Yes |

## Proposed Solutions

### Option A: Add Explicit Return Types (Recommended)

```typescript
function extractCommands(input: string): string[][] { ... }
function parseNestedCommand(args: string[]): string[][] { ... }
function parsePackagesFromArgs(args: string[], ecosystem: ParsedPackage['ecosystem']): ParsedPackage[] { ... }
```

## Acceptance Criteria

- [ ] All functions have explicit return types
- [ ] TypeScript compiles without errors
- [ ] All tests still pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Type inconsistency found |
