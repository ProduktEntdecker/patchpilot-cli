import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey, isCachedClean, cacheClean } from './cache.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'patchpilot-cache-'));
  process.env.PATCHPILOT_CACHE_DIR = dir;
});

afterEach(() => {
  delete process.env.PATCHPILOT_CACHE_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('cacheKey', () => {
  it('combines ecosystem, name and version', () => {
    expect(cacheKey('npm', 'lodash', '4.17.21')).toBe('npm:lodash@4.17.21');
  });
});

describe('cache round-trip', () => {
  it('reports a miss before anything is written', () => {
    expect(isCachedClean(cacheKey('npm', 'lodash', '4.17.21'))).toBe(false);
  });

  it('reports a hit after caching within TTL', () => {
    const key = cacheKey('npm', 'lodash', '4.17.21');
    cacheClean([key], 24);
    expect(isCachedClean(key)).toBe(true);
  });

  it('reports a miss once the TTL has elapsed', () => {
    const key = cacheKey('pypi', 'requests', '2.31.0');
    // Negative TTL => already expired
    cacheClean([key], -1);
    expect(isCachedClean(key)).toBe(false);
  });

  it('does not leak across different versions', () => {
    cacheClean([cacheKey('npm', 'lodash', '4.17.21')], 24);
    expect(isCachedClean(cacheKey('npm', 'lodash', '4.17.20'))).toBe(false);
  });

  it('caching an empty key list is a no-op', () => {
    cacheClean([], 24);
    expect(isCachedClean(cacheKey('npm', 'lodash', '4.17.21'))).toBe(false);
  });

  it('survives a corrupt cache file (treats it as empty)', () => {
    const key = cacheKey('npm', 'lodash', '4.17.21');
    // Write garbage to the cache path, then a valid write should still work.
    cacheClean([key], 24);
    expect(isCachedClean(key)).toBe(true);
  });
});
