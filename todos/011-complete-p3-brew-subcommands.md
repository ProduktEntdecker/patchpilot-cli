---
status: pending
priority: p3
issue_id: "011"
tags: [code-review, enhancement]
dependencies: []
---

# Expand Brew Subcommand Coverage

## Problem Statement

Only `brew install` is detected. `brew reinstall` and `brew upgrade` can also install malicious versions.

## Findings

**Source:** security-sentinel agent

**Evidence:**
```bash
brew reinstall malicious    # BYPASSED
brew upgrade malicious      # BYPASSED
```

## Proposed Solutions

Add `reinstall` and `upgrade` to brew detection.

```typescript
if (cmd === 'brew' && ['install', 'reinstall', 'upgrade'].includes(subcmd)) {
  return { ecosystem: 'homebrew', packageArgs: args.slice(2) };
}
```

## Acceptance Criteria

- [ ] `brew reinstall` detected
- [ ] `brew upgrade` detected
- [ ] Tests added

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Minor coverage gap |
