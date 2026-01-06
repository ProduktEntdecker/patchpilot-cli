---
status: pending
priority: p3
issue_id: "013"
tags: [code-review, typescript, architecture]
dependencies: []
---

# Type Definition Duplication Across Files

## Problem Statement

`Vulnerability` and `Ecosystem` types are defined differently in multiple files, creating potential for drift and requiring mapping logic.

## Findings

**Source:** pattern-recognition-specialist agent, architecture-strategist agent

**Evidence:**
- `src/osv.ts`: `severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'`
- `src/decision.ts`: `severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'NONE'`

Note: `MODERATE` vs `MEDIUM`, `NONE` vs `UNKNOWN`

`index.ts` has to map between them in `mapSeverity()`.

## Proposed Solutions

### Option A: Shared Types Module
Create `src/types.ts` with unified type definitions.

**Pros:** Single source of truth
**Cons:** Adds a file
**Effort:** Small
**Risk:** Low

### Option B: Use OSV Types as Source
Make decision.ts use OSV severity values directly.

**Pros:** Eliminates mapping
**Cons:** Changes decision engine interface
**Effort:** Medium
**Risk:** Low

## Acceptance Criteria

- [ ] Severity type defined in one place
- [ ] Mapping logic simplified or eliminated
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Type duplication found |
