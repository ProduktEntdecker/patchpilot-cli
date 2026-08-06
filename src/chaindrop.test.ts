import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseInstallCommand } from './parser.js';
import { checkRegistryMetadata, type SupplyChainSignal } from './registry.js';
import { checkPackageVulnerabilities } from './osv.js';
import { makeFullDecision, type Vulnerability } from './decision.js';

/**
 * ChainDrop regression suite (August 2026).
 *
 * On Aug 4, 2026 the ChainDrop worm (a Shai-Hulud successor) hijacked the
 * maintainer account behind keyv, cacheable, flat-cache and file-entry-cache
 * and pushed freshly published versions carrying a
 * `"preinstall": "node setup.mjs"` dropper. No CVE/OSV advisory existed while
 * the malicious versions were live.
 *
 * This suite reconstructs npm's registry state from the attack window
 * RELATIVE TO THE TEST CLOCK (keyv@6.0.0 tagged latest, two hours old,
 * declaring the worm's preinstall hook), so the 72h-quarantine condition
 * stays reproducible at any run date. It then asserts that the unmodified
 * production pipeline hard-blocks the direct vector via the
 * version-quarantine + install-script combination rule — with zero OSV data.
 *
 * Honest scope, mirrored in the launch content: this covers the DIRECT
 * vector (installing/updating an affected package by name). The transitive
 * path (fresh poison pulled in through existing semver ranges) is not
 * covered; see plans/transitive-dependency-coverage.md.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const MALICIOUS_VERSION = '6.0.0';
const PREVIOUS_STABLE = '5.6.0';

// Registry state as it looked during the attack window, shifted to `now`
function chainDropRegistryDoc(now: number) {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  return {
    time: {
      created: iso(8 * 365 * DAY_MS),
      modified: iso(2 * HOUR_MS),
      [PREVIOUS_STABLE]: iso(94 * DAY_MS),
      [MALICIOUS_VERSION]: iso(2 * HOUR_MS),
    },
    'dist-tags': { latest: MALICIOUS_VERSION },
    maintainers: [{ name: 'jaredwray' }],
    versions: {
      [PREVIOUS_STABLE]: { scripts: {} },
      [MALICIOUS_VERSION]: { scripts: { preinstall: 'node setup.mjs' } },
    },
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();

  const doc = chainDropRegistryDoc(Date.now());

  mockFetch.mockImplementation((url: string | URL) => {
    const u = String(url);

    // OSV knows nothing during the zero-day window
    if (u.includes('api.osv.dev')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    // keyv is a top-1000 package — low-downloads must NOT fire
    if (u.includes('api.npmjs.org')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ downloads: 120_000_000 }),
      });
    }
    // /latest manifest used by OSV's version resolution
    if (u.includes('registry.npmjs.org/keyv/latest')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ version: MALICIOUS_VERSION }),
      });
    }
    // Full registry document
    if (u.includes('registry.npmjs.org/keyv')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(doc) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Full production pipeline for one parsed package, as src/index.ts wires it:
// OSV check + registry metadata in parallel, then the combined decision.
async function runPipeline(command: string) {
  const packages = parseInstallCommand(command);
  expect(packages).not.toBeNull();

  const vulnerabilities: Vulnerability[] = [];
  const signals: SupplyChainSignal[] = [];
  for (const pkg of packages!) {
    const [osv, registry] = await Promise.all([
      checkPackageVulnerabilities(pkg.name, pkg.version, pkg.ecosystem),
      checkRegistryMetadata(pkg.name, pkg.version, pkg.ecosystem),
    ]);
    expect(osv.status).toBe('success');
    if (osv.status === 'success') {
      for (const v of osv.vulnerabilities) {
        vulnerabilities.push({
          name: pkg.name,
          version: pkg.version ?? 'latest',
          severity: v.severity === 'MEDIUM' ? 'MODERATE' : v.severity,
        });
      }
    }
    if (registry.status === 'success') {
      signals.push(...registry.signals);
    }
  }
  return makeFullDecision(vulnerabilities, signals);
}

describe('ChainDrop attack window (keyv@6.0.0, preinstall dropper, no CVE)', () => {
  it('hard-blocks `npm install keyv` while the malicious version is latest', async () => {
    const result = await runPipeline('npm install keyv');

    expect(result.decision).toBe('deny');
    expect(result.reason).toContain(
      'Just-published version that runs install scripts — possible compromised release.'
    );
    expect(result.reason).toContain(`keyv@${MALICIOUS_VERSION} was published 2 hours ago`);
    expect(result.reason).toContain('72h quarantine window');
    expect(result.reason).toContain(`Consider using keyv@${PREVIOUS_STABLE} instead.`);
  });

  it('hard-blocks the pinned malicious version `npm install keyv@6.0.0`', async () => {
    const result = await runPipeline(`npm install keyv@${MALICIOUS_VERSION}`);

    expect(result.decision).toBe('deny');
    expect(result.reason).toContain(
      'Just-published version that runs install scripts — possible compromised release.'
    );
  });

  it('hard-blocks `npm update keyv` — the v0.4.0 parser bypass, fixed in v0.5.0', async () => {
    // ChainDrop's primary direct vector: updates re-resolve semver ranges and
    // pulled the poisoned release. v0.4.0 never parsed update commands at all.
    const packages = parseInstallCommand('npm update keyv');
    expect(packages).toEqual([{ name: 'keyv', ecosystem: 'npm' }]);

    const result = await runPipeline('npm update keyv');
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain(
      'Just-published version that runs install scripts — possible compromised release.'
    );
  });

  it('blocks with ZERO OSV data — the deny comes from registry signals alone', async () => {
    const result = await runPipeline('npm install keyv');

    expect(result.decision).toBe('deny');
    // Sanity check: the OSV mock returned no advisories, so the decision
    // cannot have come from the CVE path.
    const osvCalls = mockFetch.mock.calls.filter(([u]) => String(u).includes('api.osv.dev'));
    expect(osvCalls.length).toBeGreaterThan(0);
  });

  it('does not fire once the same release has aged out of the quarantine window', async () => {
    // Same registry state, but the "malicious" version is now 90 days old and
    // OSV would long have a MAL advisory — quarantine alone must go quiet.
    const doc = chainDropRegistryDoc(Date.now() - 90 * DAY_MS + 2 * HOUR_MS);
    mockFetch.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('api.osv.dev')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (u.includes('api.npmjs.org')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ downloads: 120_000_000 }) });
      }
      if (u.includes('registry.npmjs.org/keyv/latest')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: MALICIOUS_VERSION }) });
      }
      if (u.includes('registry.npmjs.org/keyv')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(doc) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });

    const registry = await checkRegistryMetadata('keyv', undefined, 'npm');
    expect(registry.signals.find(s => s.type === 'version-quarantine')).toBeUndefined();
  });

  describe('honest scope — documented limits of the direct-vector coverage', () => {
    it('does not parse bare `npm install` (names no packages)', () => {
      // A bare install re-resolves ranges and can pull poisoned transitives
      // PatchPilot never sees. Tracked in plans/transitive-dependency-coverage.md.
      expect(parseInstallCommand('npm install')).toBeNull();
    });

    it('does not parse `npm ci` (lockfile-recorded versions only)', () => {
      // npm ci pulls no NEW poison in, but faithfully installs a compromised
      // version already recorded in the lockfile — out of scope by design.
      expect(parseInstallCommand('npm ci')).toBeNull();
    });
  });
});
