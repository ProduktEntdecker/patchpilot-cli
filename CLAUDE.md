# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm test                                  # vitest run (all suites)
npm run build                             # tsc -> dist/
npm run dev                               # tsx src/index.ts (reads stdin)

npx vitest run src/parser.test.ts          # single file
npx vitest run -t "version quarantine"     # single test by name
npm run test:watch

# End-to-end smoke test of the hook contract
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm install lodash"}}' | npx tsx src/index.ts
```

There is no linter or formatter configured — don't add lint commands to CI expectations. CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, `npm test -- --run` on Node 18, 20 and 22; the published `prepublishOnly` also builds and tests.

Commit messages and issue titles follow conventional-commit prefixes (`feat(parser):`, `fix(ci):`, `chore(release):`).

## What this is

A Claude Code **PreToolUse hook binary**, not a library and not an interactive CLI. It reads one JSON object on stdin, writes one JSON object on stdout, and exits. The exit code is part of the contract: **2 means deny**, 0 means allow/ask. Hook output shape is `{ hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }`.

The whole program runs inside Claude Code's ~10 s hook timeout, which is the binding constraint on every design decision below.

## Pipeline (src/index.ts)

`parseInstallCommand` → per-package `PackagePlan` (cache + allowlist) → **parallel** OSV and registry checks → offline typosquat → `makeFullDecision` → JSON + exit code.

Everything hangs off `main()` in `src/index.ts`; the modules below are pure-ish units called from there.

| Module | Role |
|---|---|
| `parser.ts` | Bash command → `ParsedPackage[]`. The security boundary. |
| `osv.ts` | OSV API query. **Fails closed.** |
| `registry.ts` | npm/PyPI metadata → `SupplyChainSignal[]`. **Fails open.** |
| `typosquat.ts` | Offline edit-distance check against `data/popular-packages.ts`. |
| `decision.ts` | Signals + CVEs → `allow`/`deny`/`ask`. No I/O. |
| `config.ts` | `~/.patchpilot.json` (zod). Malformed → defaults + stderr warning. |
| `cache.ts` | `~/.cache/patchpilot/clean.json`. Clean results only. |

## Invariants

These are deliberate and load-bearing. Changing one changes the product's safety posture — don't "fix" them incidentally.

**OSV fails closed, registry metadata fails open.** A failed OSV check (timeout, non-200, network error) returns `status: 'error'` and `index.ts` denies the install with an explanation. A failed registry lookup returns `{ status: 'success', signals: [] }` and the install proceeds. Rationale: missing CVE data means unknown risk; missing metadata means only missing *heuristics*. Both postures are asserted in tests.

**Latency budget is spent, not spare.** OSV query 4 s, `latest` resolution 2 s, registry 3 s, and the two check families run concurrently via `Promise.all`. Adding a sequential network round-trip risks blowing the 10 s hook timeout, which surfaces to the user as a broken install. New checks go in parallel or not at all.

**Unversioned references resolve `latest` first.** Without `resolveLatestVersion`, OSV returns advisories across every version ever published and flags packages whose current release is patched. On resolve failure it falls back to an unversioned OSV query — still fail-closed.

**`UNKNOWN` severity must never collapse to `NONE`.** Malware advisories and fresh reports often carry no CVSS score; collapsing them would silently `allow`. `MAL-*` advisories (including via `aliases`) are forced to `CRITICAL` in `coerceSeverity`.

**Only clean, exactly-versioned, non-allowlisted results are cached.** `deny`/`ask` are always re-evaluated, and `latest` is never cached because the resolved version moves. The cache doubles as OSV-outage resilience, so don't make it stricter without accounting for that.

**The allowlist skips supply-chain heuristics but never the CVE/malware check.** An allowlist can't unblock known-malicious code. See the `osvTargets` / `registryTargets` split in `index.ts`.

**Homebrew is parsed but never checked.** OSV has no Homebrew data. It's special-cased in three places (early return in `index.ts`, `checkRegistryMetadata`, `checkTyposquat`) and the user is told so explicitly rather than silently allowed.

**`update` commands are vetted like installs.** `npm update`, `pnpm up`, `yarn upgrade`, `poetry update` re-resolve ranges and were ChainDrop's primary direct vector. Also treated as installs: `npm link`, `npm exec`, `npx`, `bunx`.

## The parser is the attack surface

`parser.ts` carries 114 of the ~195 tests for a reason: anything it fails to see is unchecked. It handles command wrappers (`sudo`, `env`, `timeout`, `xargs`, `firejail`, …), separators (`&&`, `||`, `;`, `|`), nested shells (`bash -c "..."`), leading `KEY=value` assignments, `eval "quoted command"`, and path-prefixed binaries via basename matching.

Adding package-manager syntax means adding bypass tests alongside it. The `todos/` directory tracks known parser gaps by priority (`005`–`007` are open P2 bypasses: incomplete shell detection, nested-shell recursion, xargs).

## Ecosystem type is declared three times

`Ecosystem` exists independently in `parser.ts:6`, `osv.ts:1` and `registry.ts:1`. Adding an ecosystem means editing all three plus `mapEcosystem` (OSV's names are capitalized: `PyPI`, `Homebrew`), a registry adapter, a popular-package list, and the `checkTyposquat` dispatch. `todos/013-pending-p3-type-unification.md` tracks consolidating them; do that first if you're adding a fourth.

## Decision layering

`makeDecision` handles CVEs alone. `makeFullDecision` wraps it: a CVE-level `deny` always wins and supply-chain detail is appended; otherwise a single supply-chain signal escalates `allow` → `ask`. `evaluateSignalCombination` then hard-denies known high-risk *combinations* (new-package + install-script, new-package + low-downloads, quarantine + install-script, typosquat + install-script) — the reasoning being that a lone `ask` gets clicked through. Tuning thresholds happens in the named constants at the top of `registry.ts`, not inline.

## Test conventions

`vi.stubGlobal('fetch', mockFetch)` with per-test `mockResolvedValue`; no network in tests.

**Regression suites are clock-relative.** `chaindrop.test.ts` rebuilds npm's registry state from the August 2026 attack window as offsets from `Date.now()`, so the 72 h quarantine condition still fires whenever the suite runs. Any new incident regression test must do the same — hardcoded dates would decay into false passes. These suites run the *unmodified* production pipeline end to end rather than asserting on internals.

## Known coverage gaps (documented, not bugs)

- **Transitive dependencies.** Only packages named on the command line are vetted; poison pulled in through existing semver ranges is invisible by construction. `plans/transitive-dependency-coverage.md` holds the evaluated design (lockfile diff + PostToolUse audit); tracked as issue #11.
- **`npm ci`** produces no lockfile diff and is explicitly uncovered — asserted as a test in `chaindrop.test.ts`.
- **cargo / crates.io** is not an ecosystem at all. Issue #42.
- **Private registries, URL/git installs** (issue #10) and offline operation are out of scope.
