---
status: pending
priority: p3
issue_id: "014"
tags: [code-review, quality, refactoring]
dependencies: ["004"]
---

# Code Simplification Opportunities

## Problem Statement

The parser has some unnecessary complexity that could be reduced for better readability.

## Findings

**Source:** code-simplicity-reviewer agent

**Evidence:**
1. Type guard `isOperator` can be inlined (4 LOC)
2. `parsePackagesFromArgs` has duplicate patterns for npm/homebrew vs pypi
3. Inline array allocations in operator checks

## Proposed Solutions

### Inline Type Guard
```typescript
// Instead of:
if (isOperator(token)) { ... }

// Inline:
if (typeof token === 'object' && 'op' in token) { ... }
```

### Simplify parsePackagesFromArgs
```typescript
function parsePackagesFromArgs(args: string[], ecosystem: ParsedPackage['ecosystem']): ParsedPackage[] {
  const separator = ecosystem === 'pypi' ? '==' : '@';

  return args
    .filter(arg => !arg.startsWith('-'))
    .map(arg => {
      const idx = ecosystem === 'pypi' ? arg.indexOf(separator) : arg.lastIndexOf(separator);
      if (idx > 0) {
        return { name: arg.substring(0, idx), version: arg.substring(idx + separator.length), ecosystem };
      }
      return { name: arg, ecosystem };
    });
}
```

**Estimated LOC reduction:** ~12-15 lines (~15%)

## Acceptance Criteria

- [ ] Code simplified without changing behavior
- [ ] All tests still pass
- [ ] Code is more readable

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Simplification opportunities found |
