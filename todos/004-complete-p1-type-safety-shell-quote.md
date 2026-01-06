---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, typescript, types]
dependencies: []
---

# Type Definition Diverges from shell-quote Library Types

## Problem Statement

The parser defines a custom `ParsedToken` type that diverges from `shell-quote`'s actual `ParseEntry` type. This creates type safety issues and may cause runtime surprises.

**Why it matters:** Using incorrect types means TypeScript can't catch potential bugs. The type guard may incorrectly classify tokens.

## Findings

**Source:** kieran-typescript-reviewer agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 9-13

**Evidence:**
```typescript
// Current custom type:
type ParsedToken = string | { op: string } | { comment: string } | { pattern: string };

// shell-quote's actual type:
export type ParseEntry =
    | string
    | { op: ControlOperator }
    | { op: "glob"; pattern: string }
    | { comment: string };
```

**Issues:**
1. Custom type uses `{ op: string }` instead of `{ op: ControlOperator }` - loses type narrowing
2. Custom type has `{ pattern: string }` separate, but library uses `{ op: "glob"; pattern: string }`
3. Type guard would incorrectly match glob entries as operators

## Proposed Solutions

### Option A: Use Library Types (Recommended)
Import and use shell-quote's exported types directly.

**Pros:** Type-safe, auto-updates with library
**Cons:** None
**Effort:** Small
**Risk:** None

```typescript
import { parse, type ParseEntry, type ControlOperator } from 'shell-quote';

function isControlOperator(token: ParseEntry): token is { op: ControlOperator } {
  return typeof token === 'object' && token !== null && 'op' in token && !('pattern' in token);
}
```

### Option B: Keep Custom Types but Align
Align custom types with library's actual structure.

**Pros:** More explicit control
**Cons:** Can drift from library
**Effort:** Small
**Risk:** Low

## Recommended Action
<!-- Fill during triage -->

## Technical Details

**Affected files:**
- `src/parser.ts` - Type definitions, type guard

**Components impacted:**
- Type safety throughout parser

## Acceptance Criteria

- [ ] Remove custom `ParsedToken` type
- [ ] Import `ParseEntry` from shell-quote
- [ ] Update type guard to properly discriminate globs from operators
- [ ] TypeScript compiles without errors
- [ ] All tests still pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Type divergence found |

## Resources

- PR #7: https://github.com/ProduktEntdecker/patchpilot-cli/pull/7
- shell-quote types: https://github.com/ljharb/shell-quote
