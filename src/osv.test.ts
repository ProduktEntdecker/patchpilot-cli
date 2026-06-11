import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkPackageVulnerabilities } from './osv.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function osvResponse(vulns: Array<{ id: string; severity?: string }> = []) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        vulns: vulns.map(v => ({
          id: v.id,
          summary: '',
          database_specific: { severity: v.severity ?? 'HIGH' },
        })),
      }),
  };
}

function npmLatestResponse(version: string) {
  return { ok: true, status: 200, json: () => Promise.resolve({ version }) };
}

function pypiResponse(version: string) {
  return { ok: true, status: 200, json: () => Promise.resolve({ info: { version } }) };
}

describe('checkPackageVulnerabilities — malware advisories (MAL-*)', () => {
  function osvRawResponse(vulns: unknown[]) {
    return { ok: true, status: 200, json: () => Promise.resolve({ vulns }) };
  }

  it('treats MAL-* advisories without any severity data as CRITICAL', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://api.osv.dev/v1/query') {
        // Real-world shape: MAL entries typically have no severity array
        // and no database_specific.severity.
        return Promise.resolve(
          osvRawResponse([{ id: 'MAL-2026-1234', summary: 'Malicious code in evil-pkg (npm)' }])
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await checkPackageVulnerabilities('evil-pkg', '1.0.0', 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.vulnerabilities[0].severity).toBe('CRITICAL');
    expect(result.vulnerabilities[0].id).toBe('MAL-2026-1234');
  });

  it('treats advisories with a MAL-* alias as CRITICAL even when the id is a GHSA', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        osvRawResponse([
          { id: 'GHSA-xxxx-yyyy-zzzz', aliases: ['MAL-2026-9999'], summary: 'malware' },
        ])
      )
    );

    const result = await checkPackageVulnerabilities('evil-pkg', '1.0.0', 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.vulnerabilities[0].severity).toBe('CRITICAL');
  });

  it('keeps non-MAL advisories without severity data as UNKNOWN (not CRITICAL)', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(osvRawResponse([{ id: 'GHSA-aaaa-bbbb-cccc', summary: 'unscored' }]))
    );

    const result = await checkPackageVulnerabilities('some-pkg', '1.0.0', 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.vulnerabilities[0].severity).toBe('UNKNOWN');
  });
});

describe('checkPackageVulnerabilities — version resolution', () => {
  it('resolves npm latest from registry when no version given, then queries OSV with that version', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    mockFetch.mockImplementation((url: string, opts?: { body?: string }) => {
      calls.push({ url, body: opts?.body });
      if (url === 'https://registry.npmjs.org/vite/latest') {
        return Promise.resolve(npmLatestResponse('8.0.8'));
      }
      if (url === 'https://api.osv.dev/v1/query') {
        return Promise.resolve(osvResponse([])); // no vulns at 8.0.8
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await checkPackageVulnerabilities('vite', undefined, 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.vulnerabilities).toEqual([]);
    expect(result.resolvedVersion).toBe('8.0.8');

    // OSV must have been called WITH the resolved version (not unversioned)
    const osvCall = calls.find(c => c.url === 'https://api.osv.dev/v1/query');
    expect(osvCall).toBeDefined();
    const body = JSON.parse(osvCall!.body!);
    expect(body.version).toBe('8.0.8');
  });

  it('encodes scoped npm packages correctly when resolving latest', async () => {
    const seenUrls: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      seenUrls.push(url);
      if (url.startsWith('https://registry.npmjs.org/')) {
        return Promise.resolve(npmLatestResponse('20.0.0'));
      }
      return Promise.resolve(osvResponse([]));
    });

    await checkPackageVulnerabilities('@types/node', undefined, 'npm');

    expect(seenUrls).toContain('https://registry.npmjs.org/@types%2Fnode/latest');
  });

  it('resolves PyPI latest when no version given', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    mockFetch.mockImplementation((url: string, opts?: { body?: string }) => {
      calls.push({ url, body: opts?.body });
      if (url.startsWith('https://pypi.org/')) {
        return Promise.resolve(pypiResponse('2.31.0'));
      }
      return Promise.resolve(osvResponse([]));
    });

    const result = await checkPackageVulnerabilities('requests', undefined, 'pypi');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.resolvedVersion).toBe('2.31.0');

    const osvCall = calls.find(c => c.url === 'https://api.osv.dev/v1/query');
    expect(JSON.parse(osvCall!.body!).version).toBe('2.31.0');
  });

  it('skips registry resolution when version is already specified', async () => {
    const seenUrls: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      seenUrls.push(url);
      return Promise.resolve(osvResponse([]));
    });

    await checkPackageVulnerabilities('vite', '5.0.0', 'npm');

    expect(seenUrls).not.toContain('https://registry.npmjs.org/vite/latest');
    expect(seenUrls).toContain('https://api.osv.dev/v1/query');
  });

  it('falls back to unversioned OSV query when registry resolution fails (404)', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    mockFetch.mockImplementation((url: string, opts?: { body?: string }) => {
      calls.push({ url, body: opts?.body });
      if (url.startsWith('https://registry.npmjs.org/')) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      return Promise.resolve(osvResponse([]));
    });

    const result = await checkPackageVulnerabilities('nonexistent', undefined, 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.resolvedVersion).toBeUndefined();

    // OSV called WITHOUT version field (preserves prior behavior)
    const osvCall = calls.find(c => c.url === 'https://api.osv.dev/v1/query');
    const body = JSON.parse(osvCall!.body!);
    expect(body.version).toBeUndefined();
  });

  it('falls back gracefully when registry resolution throws (network error)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('https://registry.npmjs.org/')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(osvResponse([]));
    });

    const result = await checkPackageVulnerabilities('vite', undefined, 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.resolvedVersion).toBeUndefined();
    expect(result.vulnerabilities).toEqual([]);
  });

  it('reproduces the vite false positive: unversioned query would return 19 vulns, versioned returns 0', async () => {
    // This test demonstrates the bug being fixed.
    mockFetch.mockImplementation((url: string, opts?: { body?: string }) => {
      if (url === 'https://registry.npmjs.org/vite/latest') {
        return Promise.resolve(npmLatestResponse('8.0.8'));
      }
      // Simulate OSV: returns 19 historical vulns when no version, 0 for current latest
      const body = JSON.parse(opts!.body!);
      if (body.version === '8.0.8') {
        return Promise.resolve(osvResponse([])); // patched
      }
      return Promise.resolve(
        osvResponse(
          Array.from({ length: 19 }, (_, i) => ({ id: `GHSA-vite-${i}`, severity: 'HIGH' }))
        )
      );
    });

    const result = await checkPackageVulnerabilities('vite', undefined, 'npm');

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    // Without the fix this would be 19. With the fix, it's 0.
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.resolvedVersion).toBe('8.0.8');
  });
});
