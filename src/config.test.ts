import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, isAllowlisted, DEFAULT_CONFIG } from './config.js';

let dir: string;
let configFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'patchpilot-cfg-'));
  configFile = join(dir, 'config.json');
  process.env.PATCHPILOT_CONFIG = configFile;
});

afterEach(() => {
  delete process.env.PATCHPILOT_CONFIG;
  rmSync(dir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('parses a valid config', () => {
    writeFileSync(configFile, JSON.stringify({ allowlist: ['@types/*', 'lodash'] }));
    const config = loadConfig();
    expect(config.allowlist).toEqual(['@types/*', 'lodash']);
    expect(config.cache.enabled).toBe(true);
    expect(config.cache.ttlHours).toBe(24);
  });

  it('honors cache overrides', () => {
    writeFileSync(configFile, JSON.stringify({ cache: { enabled: false, ttlHours: 1 } }));
    const config = loadConfig();
    expect(config.cache.enabled).toBe(false);
    expect(config.cache.ttlHours).toBe(1);
  });

  it('falls back to defaults on malformed JSON (does not throw)', () => {
    writeFileSync(configFile, '{ not valid json');
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('falls back to defaults on schema violation (does not throw)', () => {
    writeFileSync(configFile, JSON.stringify({ allowlist: 'should-be-an-array' }));
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe('isAllowlisted', () => {
  const config = { allowlist: ['lodash', '@types/*', '@myorg/'], cache: DEFAULT_CONFIG.cache };

  it('matches exact names', () => {
    expect(isAllowlisted('lodash', config)).toBe(true);
    expect(isAllowlisted('lodash-es', config)).toBe(false);
  });

  it('matches trailing-* scope wildcards', () => {
    expect(isAllowlisted('@types/node', config)).toBe(true);
    expect(isAllowlisted('@types/react', config)).toBe(true);
    expect(isAllowlisted('@other/node', config)).toBe(false);
  });

  it('returns false for an empty allowlist', () => {
    expect(isAllowlisted('anything', DEFAULT_CONFIG)).toBe(false);
  });
});
