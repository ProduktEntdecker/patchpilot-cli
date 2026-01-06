---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, security, bypass]
dependencies: []
---

# xargs Bypass Vector

## Problem Statement

Commands piped through xargs bypass detection. This is a common pattern for installing packages from a list.

## Findings

**Source:** security-sentinel agent

**Evidence:**
```bash
echo malicious | xargs npm install    # BYPASSED
cat packages.txt | xargs npm install  # BYPASSED
```

## Proposed Solutions

### Option A: Detect xargs + Install Pattern
When xargs is followed by an install command, flag for review.

**Pros:** Catches common pattern
**Cons:** May have false positives
**Effort:** Medium
**Risk:** Medium

```typescript
// Detect: xargs npm install, xargs -I{} npm install {}
if (cmd === 'xargs') {
  const installIdx = args.findIndex((a, i) =>
    i > 0 && ['npm', 'pip', 'brew'].includes(a)
  );
  if (installIdx > 0) {
    const installCmd = args.slice(installIdx);
    return detectInstallCommand(installCmd);
  }
}
```

## Acceptance Criteria

- [ ] `xargs npm install` pattern detected
- [ ] `xargs -I{} npm install {}` detected
- [ ] Tests added for xargs patterns

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | xargs bypass found |
