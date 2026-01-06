---
status: pending
priority: p3
issue_id: "012"
tags: [code-review, testing]
dependencies: []
---

# Missing Test Coverage for Edge Cases

## Problem Statement

Several documented code paths lack explicit test coverage.

## Findings

**Source:** kieran-typescript-reviewer agent, pattern-recognition-specialist agent

**Missing tests:**
1. `pip3 install` - Code handles it, no test
2. `npx install` - Code handles it, no test
3. Scoped packages without version: `@types/node`
4. `npm install` with no packages (should return null)
5. Glob patterns: `npm install 'pkg-*'`
6. Redirection: `npm install pkg > log.txt`
7. Background operator: `npm install pkg &`
8. pip extras: `pip install requests[security]`

## Proposed Solutions

Add test cases for all edge cases.

```typescript
describe('edge cases', () => {
  it('handles pip3 install', () => {
    expect(parseInstallCommand('pip3 install requests')).toEqual([
      { name: 'requests', ecosystem: 'pypi' }
    ]);
  });

  it('returns null for npm install with no packages', () => {
    expect(parseInstallCommand('npm install')).toBeNull();
  });

  it('handles scoped packages without version', () => {
    expect(parseInstallCommand('npm install @types/node')).toEqual([
      { name: '@types/node', ecosystem: 'npm' }
    ]);
  });
});
```

## Acceptance Criteria

- [ ] All listed edge cases have tests
- [ ] Test coverage increased

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Test gaps identified |
