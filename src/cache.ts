import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// On-disk cache of packages that checked out completely clean (no CVEs, no
// supply chain signals) at an exact version. A cache hit lets the hook skip
// all network checks for that package — cutting latency and, importantly,
// avoiding fail-closed blocks when the OSV API is briefly unreachable.
//
// Only clean `allow` results are ever stored; `deny`/`ask` are always
// re-evaluated. Unversioned ("latest") references are never cached, since the
// resolved version can change underneath us.

interface CacheFile {
  version: 1;
  // key -> expiry timestamp (epoch ms)
  entries: Record<string, number>;
}

const EMPTY: CacheFile = { version: 1, entries: {} };

function cacheDir(): string {
  return process.env.PATCHPILOT_CACHE_DIR ?? join(homedir(), '.cache', 'patchpilot');
}

function cachePath(): string {
  return join(cacheDir(), 'clean.json');
}

export function cacheKey(ecosystem: string, name: string, version: string): string {
  return `${ecosystem}:${name}@${version}`;
}

function read(): CacheFile {
  try {
    const data = JSON.parse(readFileSync(cachePath(), 'utf8')) as Partial<CacheFile>;
    if (data && data.version === 1 && data.entries && typeof data.entries === 'object') {
      return { version: 1, entries: data.entries };
    }
  } catch {
    // Missing or corrupt cache is not an error.
  }
  return { version: 1, entries: {} };
}

export function isCachedClean(key: string): boolean {
  const expiry = read().entries[key];
  return typeof expiry === 'number' && expiry > Date.now();
}

// Record the given keys as clean for ttlHours. Prunes expired entries on the
// way through. Any failure (read-only FS, etc.) is swallowed — caching is an
// optimization and must never block an install.
export function cacheClean(keys: string[], ttlHours: number): void {
  if (keys.length === 0) return;
  try {
    const cache = read();
    const now = Date.now();
    for (const [k, exp] of Object.entries(cache.entries)) {
      if (exp <= now) delete cache.entries[k];
    }
    const expiry = now + ttlHours * 60 * 60 * 1000;
    for (const k of keys) cache.entries[k] = expiry;

    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(cache));
  } catch {
    // intentionally ignored
  }
}

// Exported for tests/tooling that need to reset state.
export { EMPTY as EMPTY_CACHE };
