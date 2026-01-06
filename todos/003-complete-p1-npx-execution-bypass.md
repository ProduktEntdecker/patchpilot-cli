---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, security, bypass]
dependencies: []
---

# npx Arbitrary Code Execution Not Detected

## Problem Statement

The parser checks for `npx install` but `npx` is primarily used to execute packages directly (`npx malicious-package`), not install them. This is the primary attack vector for npx and is completely undetected.

**Why it matters:** `npx` downloads and executes arbitrary code. An attacker using `npx malicious-pkg` can run code on the system without any vulnerability check.

## Findings

**Source:** security-sentinel agent

**Location:** `/Users/floriansteiner/Documents/GitHub/patchpilot-cli/src/parser.ts`, lines 83-86

**Evidence:**
```typescript
// Current code only catches:
if ((cmd === 'npm' || cmd === 'npx') && ['install', 'i', 'add'].includes(subcmd))

// But npx typically runs as:
npx malicious-package        # BYPASSED - executes arbitrary code!
npx --yes malicious          # BYPASSED - auto-accepts prompts
npm exec malicious           # BYPASSED - same effect
bunx malicious               # BYPASSED - bun equivalent
```

## Proposed Solutions

### Option A: Detect npx Execution Pattern (Recommended)
Treat `npx <package>` as equivalent to an install for security checking.

**Pros:** Closes critical attack vector
**Cons:** May have false positives for local scripts
**Effort:** Small
**Risk:** Medium (need to handle local npx scripts)

```typescript
// Detect npx <package> (not npx install)
if (cmd === 'npx' || cmd === 'bunx') {
  // Skip flags
  let pkgIndex = 1;
  while (pkgIndex < args.length && args[pkgIndex].startsWith('-')) {
    pkgIndex++;
  }
  if (pkgIndex < args.length) {
    const pkg = args[pkgIndex];
    // Exclude local scripts (./something, ../something)
    if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
      return { ecosystem: 'npm', packageArgs: [pkg] };
    }
  }
}

// Detect npm exec <package>
if (cmd === 'npm' && subcmd === 'exec') {
  return { ecosystem: 'npm', packageArgs: args.slice(2) };
}
```

### Option B: Allowlist Local Scripts
Only check packages that look like npm package names.

**Pros:** Reduces false positives
**Cons:** More complex logic
**Effort:** Medium
**Risk:** Low

## Recommended Action
<!-- Fill during triage -->

## Technical Details

**Affected files:**
- `src/parser.ts` - `detectInstallCommand` function

**Components impacted:**
- npx/bunx/npm exec detection

## Acceptance Criteria

- [ ] `npx malicious-package` is detected and blocked
- [ ] `npx --yes malicious` is detected (flags handled)
- [ ] `npm exec malicious` is detected
- [ ] `bunx malicious` is detected
- [ ] Local scripts `npx ./script.js` are NOT flagged
- [ ] Tests added for npx execution patterns

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-06 | Created from code review | Primary npx attack vector unprotected |

## Resources

- PR #7: https://github.com/ProduktEntdecker/patchpilot-cli/pull/7
- npx documentation: https://docs.npmjs.com/cli/commands/npx
