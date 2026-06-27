import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRegistryMetadata } from './registry.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function npmRegistryResponse(overrides: {
  created?: string;
  latestVersion?: string;
  latestPublished?: string;
  previousVersion?: string;
  previousPublished?: string;
  maintainers?: number;
  scripts?: Record<string, string>;
} = {}) {
  const now = new Date();
  const created = overrides.created ?? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const latestVersion = overrides.latestVersion ?? '2.0.0';
  const latestPublished = overrides.latestPublished ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const previousVersion = overrides.previousVersion ?? '1.9.0';
  const previousPublished = overrides.previousPublished ?? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const maintainers = Array.from({ length: overrides.maintainers ?? 3 }, (_, i) => ({
    name: `maintainer-${i}`,
  }));

  return {
    time: {
      created,
      modified: latestPublished,
      [previousVersion]: previousPublished,
      [latestVersion]: latestPublished,
    },
    'dist-tags': { latest: latestVersion },
    maintainers,
    versions: {
      [previousVersion]: { scripts: {} },
      [latestVersion]: { scripts: overrides.scripts ?? {} },
    },
  };
}

function npmDownloadsResponse(downloads: number) {
  return { downloads, start: '2026-03-26', end: '2026-04-01', package: 'test-pkg' };
}

describe('checkRegistryMetadata', () => {
  describe('homebrew', () => {
    it('returns empty signals for homebrew packages', async () => {
      const result = await checkRegistryMetadata('wget', undefined, 'homebrew');
      expect(result).toEqual({ status: 'success', signals: [] });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('npm — version quarantine', () => {
    it('flags version published < 72h ago', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse({
            latestVersion: '1.14.1',
            latestPublished: oneHourAgo,
            previousVersion: '1.14.0',
            previousPublished: threeMonthsAgo,
          })),
        });
      });

      const result = await checkRegistryMetadata('axios', '1.14.1', 'npm');
      expect(result.status).toBe('success');

      const quarantine = result.signals.find(s => s.type === 'version-quarantine');
      expect(quarantine).toBeDefined();
      expect(quarantine!.severity).toBe('HIGH');
      expect(quarantine!.detail).toContain('1.14.1');
      expect(quarantine!.detail).toContain('72h quarantine');
      expect(quarantine!.suggestion).toContain('1.14.0');
      expect(result.previousStableVersion).toBe('1.14.0');
    });

    it('does not flag version published > 72h ago', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse({
            latestPublished: fiveDaysAgo,
          })),
        });
      });

      const result = await checkRegistryMetadata('lodash', undefined, 'npm');
      const quarantine = result.signals.find(s => s.type === 'version-quarantine');
      expect(quarantine).toBeUndefined();
    });

    it('resolves latest version when no version specified', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse({
            latestVersion: '3.0.0',
            latestPublished: twoHoursAgo,
            previousVersion: '2.9.0',
            previousPublished: threeMonthsAgo,
          })),
        });
      });

      const result = await checkRegistryMetadata('some-pkg', undefined, 'npm');
      const quarantine = result.signals.find(s => s.type === 'version-quarantine');
      expect(quarantine).toBeDefined();
      expect(quarantine!.detail).toContain('3.0.0');
    });

    it('skips pre-release versions when suggesting previous stable', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            time: {
              created: sixMonthsAgo,
              modified: oneHourAgo,
              '1.0.0': sixMonthsAgo,
              '2.0.0-beta.1': twoHoursAgo,
              '2.0.0': oneHourAgo,
            },
            'dist-tags': { latest: '2.0.0' },
            maintainers: [{ name: 'dev' }],
          }),
        });
      });

      const result = await checkRegistryMetadata('test-pkg', '2.0.0', 'npm');
      expect(result.previousStableVersion).toBe('1.0.0');
    });
  });

  describe('npm — new package detection', () => {
    it('flags package created < 7 days ago', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(5)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse({
            created: twoDaysAgo,
            latestPublished: twoDaysAgo,
          })),
        });
      });

      const result = await checkRegistryMetadata('plain-crypto-js', undefined, 'npm');
      const newPkg = result.signals.find(s => s.type === 'new-package');
      expect(newPkg).toBeDefined();
      expect(newPkg!.severity).toBe('HIGH');
      expect(newPkg!.detail).toContain('no established history');
    });

    it('does not flag package created > 7 days ago', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse()),
        });
      });

      const result = await checkRegistryMetadata('lodash', undefined, 'npm');
      const newPkg = result.signals.find(s => s.type === 'new-package');
      expect(newPkg).toBeUndefined();
    });
  });

  describe('npm — low downloads', () => {
    it('flags package with < 100 weekly downloads', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(12)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse()),
        });
      });

      const result = await checkRegistryMetadata('obscure-pkg', undefined, 'npm');
      const lowDl = result.signals.find(s => s.type === 'low-downloads');
      expect(lowDl).toBeDefined();
      expect(lowDl!.severity).toBe('MEDIUM');
      expect(lowDl!.detail).toContain('12 weekly downloads');
    });

    it('does not flag package with >= 100 weekly downloads', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse()),
        });
      });

      const result = await checkRegistryMetadata('popular-pkg', undefined, 'npm');
      const lowDl = result.signals.find(s => s.type === 'low-downloads');
      expect(lowDl).toBeUndefined();
    });
  });

  describe('npm — fail-open', () => {
    it('returns empty signals on registry timeout', async () => {
      mockFetch.mockRejectedValue(new Error('AbortError: The operation was aborted'));

      const result = await checkRegistryMetadata('any-pkg', undefined, 'npm');
      expect(result).toEqual({ status: 'success', signals: [] });
    });

    it('returns empty signals on registry 500', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await checkRegistryMetadata('any-pkg', undefined, 'npm');
      expect(result).toEqual({ status: 'success', signals: [] });
    });
  });

  describe('npm — scoped packages', () => {
    it('encodes scoped package names in URL', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(500000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse()),
        });
      });

      await checkRegistryMetadata('@types/node', undefined, 'npm');

      const registryCall = mockFetch.mock.calls.find(
        (call: string[]) => call[0].includes('registry.npmjs.org')
      );
      expect(registryCall).toBeDefined();
      expect(registryCall![0]).toContain('@types%2Fnode');
    });
  });

  describe('npm — combined signals (Axios attack scenario)', () => {
    it('flags all three signals for a brand-new malicious package', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(0)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            time: {
              created: threeHoursAgo,
              modified: threeHoursAgo,
              '4.2.1': threeHoursAgo,
            },
            'dist-tags': { latest: '4.2.1' },
            maintainers: [{ name: 'attacker' }],
          }),
        });
      });

      const result = await checkRegistryMetadata('plain-crypto-js', '4.2.1', 'npm');
      expect(result.signals).toHaveLength(3);

      const types = result.signals.map(s => s.type);
      expect(types).toContain('version-quarantine');
      expect(types).toContain('new-package');
      expect(types).toContain('low-downloads');
    });
  });

  describe('pypi — version quarantine', () => {
    it('flags version published < 72h ago', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          info: { name: 'evil-pkg' },
          releases: {
            '1.0.0': [{ upload_time_iso_8601: sixMonthsAgo }],
            '1.1.0': [{ upload_time_iso_8601: twoHoursAgo }],
          },
        }),
      });

      const result = await checkRegistryMetadata('evil-pkg', '1.1.0', 'pypi');
      const quarantine = result.signals.find(s => s.type === 'version-quarantine');
      expect(quarantine).toBeDefined();
      expect(quarantine!.detail).toContain('1.1.0');
      expect(quarantine!.suggestion).toContain('1.0.0');
    });
  });

  describe('pypi — new package detection', () => {
    it('flags package created < 7 days ago', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          info: { name: 'new-evil' },
          releases: {
            '0.1.0': [{ upload_time_iso_8601: oneDayAgo }],
          },
        }),
      });

      const result = await checkRegistryMetadata('new-evil', '0.1.0', 'pypi');
      const newPkg = result.signals.find(s => s.type === 'new-package');
      expect(newPkg).toBeDefined();
      expect(newPkg!.detail).toContain('no established history');
    });
  });

  describe('pypi — fail-open', () => {
    it('returns empty signals on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await checkRegistryMetadata('any-pkg', undefined, 'pypi');
      expect(result).toEqual({ status: 'success', signals: [] });
    });
  });

  describe('npm — install scripts', () => {
    it('flags a package with a postinstall script', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse({
            latestVersion: '3.0.0',
            scripts: { postinstall: 'node ./setup.js' },
          })),
        });
      });

      const result = await checkRegistryMetadata('some-native-pkg', '3.0.0', 'npm');
      const signal = result.signals.find(s => s.type === 'install-script');
      expect(signal).toBeDefined();
      expect(signal!.severity).toBe('MEDIUM');
      expect(signal!.detail).toContain('postinstall');
      expect(signal!.suggestion).toContain('--ignore-scripts');
    });

    it('does not flag a package without lifecycle scripts', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('api.npmjs.org')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(npmDownloadsResponse(50000)) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npmRegistryResponse({
            latestVersion: '3.0.0',
            scripts: { test: 'vitest', build: 'tsc' },
          })),
        });
      });

      const result = await checkRegistryMetadata('clean-pkg', '3.0.0', 'npm');
      expect(result.signals.find(s => s.type === 'install-script')).toBeUndefined();
    });
  });
});
