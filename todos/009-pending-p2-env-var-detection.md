---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, security, quality]
dependencies: []
---

# Fragile Environment Variable Detection

## Problem Statement

The current env var detection is too simplistic and could incorrectly skip package names with `=` or treat URL arguments as env vars.

## Findings

**Source:** kieran-typescript-reviewer agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 27-30

**Evidence:**
```typescript
// Current fragile logic:
if (current.length === 0 && token.includes('=') && !token.startsWith('-')) {
  continue;
}

// Could incorrectly skip:
// - Package name: @scope/pkg=foo
// - URL argument: https://example.com?foo=bar
```

## Proposed Solutions

### Option A: Proper Regex Pattern (Recommended)
Use regex matching standard env var format.

**Pros:** Accurate detection
**Cons:** Slightly more complex
**Effort:** Small
**Risk:** Low

```typescript
const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;

// In extractCommands:
if (currentCommandTokens.length === 0 && ENV_VAR_PATTERN.test(token)) {
  continue;
}
```

## Acceptance Criteria

- [ ] `NODE_ENV=prod npm install` correctly handled
- [ ] `@scope/pkg=foo` NOT skipped as env var
- [ ] URL args with `=` NOT skipped
- [ ] Tests added for edge cases

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Fragile detection found |
