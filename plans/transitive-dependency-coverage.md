# Transitive Dependency Coverage — Design Evaluation

**Status:** Evaluation (no implementation yet)
**Created:** 2026-08-06, alongside v0.5.0
**Context:** ChainDrop validation (see `src/chaindrop.test.ts`, Issue #30)

## Problem Statement

PatchPilot vets the packages **named on the command line**. That covers the
direct vector — `npm install keyv` or `npm update keyv` while a poisoned
version is live. It does not cover the **transitive** path, which was
ChainDrop's dominant infection route:

- `npm install` / `npm update` (bare or targeted) re-resolve semver ranges.
  An existing `"keyv": "^5.6.0"` range pulls a freshly published poisoned
  `5.6.1` without keyv ever appearing in the command PatchPilot parses.
  A bare `npm install` names no packages at all.
- `npm ci` installs only the exact versions recorded in the lockfile, so it
  pulls no *new* poison in — but it faithfully installs a compromised version
  that is already recorded there.

Both cases are invisible to command-line parsing by construction. Closing the
gap requires looking at what the package manager actually resolved — i.e. the
**lockfile**.

## Proposed Approach: Lockfile-Diff Checking

### Core idea

Hook the same PreToolUse event, but instead of only parsing the command:

1. **Before** the install runs: snapshot the lockfile
   (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`,
   `poetry.lock`) — content hash plus parsed `(name, version)` set.
2. Let the command run (PatchPilot cannot see resolution results before
   execution — npm decides versions at run time).
3. **After** the install (PostToolUse hook): diff the new lockfile against the
   snapshot. Every **added or version-changed** entry is a candidate.
4. Run the existing pipeline (OSV + registry signals + combination rules) over
   the candidate set. On a deny-level finding: report loudly and offer the
   rollback command (`git checkout -- package-lock.json && npm ci`, or the
   ecosystem equivalent).

This turns the check from *pre-execution gate* into *pre-execution gate +
post-execution audit*. The gate still blocks the direct vector before code
runs; the audit catches transitive poison **after files land but typically
before the developer executes the project** — and pinpoints exactly which
transitive versions changed.

### Why not resolve the tree ourselves pre-execution?

Considered and rejected for v0.5.x:

- **Full resolution shadowing** (run `npm install --dry-run --json` or
  Arborist first): accurate, but adds seconds of latency to every install,
  duplicates package-manager logic per ecosystem, and drifts out of sync with
  the user's actual npm/pnpm/yarn/bun version.
- **Range auditing** (walk `package.json` ranges and check what they *could*
  resolve to): cheap but speculative — flags poison that would not actually be
  picked, misses overrides/resolutions, and cannot see hoisting decisions.

The lockfile diff is the only source of truth for what was *actually*
installed, and reading two lockfile states is milliseconds, not seconds.

### Critical limitation to design around

Install scripts of freshly added transitive packages run **during** step 2 —
before the post-audit. Mitigation options, in preference order:

1. Recommend `--ignore-scripts` as the default posture in agent sessions
   (PatchPilot can inject it or advise it; npm 11+ made this viable for most
   packages) and let the post-audit gate the first *execution* instead.
2. For npm specifically: pre-run `npm install --dry-run
   --package-lock-only` to compute the would-be lockfile without executing
   scripts, then diff and gate **before** the real install. Slower (adds one
   resolution pass) but closes the script-execution window entirely. Evaluate
   as an opt-in `strict` mode.

### Scope decisions for a first implementation

| In scope (v0.6.0 candidate) | Out of scope |
| --- | --- |
| npm `package-lock.json` diff (largest attack surface, ChainDrop's route) | Vendored/git dependencies |
| PostToolUse audit + rollback suggestion | Automatic rollback without user confirmation |
| Reuse of existing OSV/registry/combination pipeline | New signal types |
| `strict` opt-in: `--package-lock-only` pre-resolution for npm | Shadow resolution for pnpm/yarn/bun/poetry (follow-up) |

### Performance budget

The hook budget is ~10s (Claude Code hook timeout). Post-audit on a lockfile
diff of N changed packages costs the same as N direct checks today (parallel
OSV + registry, ~1–3s for typical diffs, plus cache hits for unchanged
packages via the v0.4.0 clean-result cache). The `strict` pre-resolution mode
adds one `npm install --package-lock-only` pass (~2–8s on medium projects) —
acceptable only as opt-in.

## Open Questions

1. PostToolUse reporting channel: hook output is advisory at that point —
   what is the strongest honest UX? (Deny-on-next-command until acknowledged?)
2. Lockfile parsing: `@npmcli/arborist` vs. hand-rolled JSON/YAML readers —
   dependency weight vs. correctness across lockfile versions.
3. Monorepos: multiple lockfiles / workspaces — which ones to snapshot?
4. Cache interaction: transitive-clean results should share the existing
   clean-result cache keyed by `(ecosystem, name, version)`.

## Decision

Ship this document with v0.5.0 as the honest answer to "what about
transitive dependencies?" — evaluation done, lockfile-diff selected as the
approach, implementation targeted for the next minor release once the open
questions above are resolved.
