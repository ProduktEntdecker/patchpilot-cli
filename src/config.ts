import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

// User config lives at ~/.patchpilot.json (override with PATCHPILOT_CONFIG).
// Everything is optional; a missing or malformed file falls back to defaults
// rather than crashing the hook.
const ConfigSchema = z.object({
  allowlist: z.array(z.string()).default([]),
  cache: z
    .object({
      enabled: z.boolean().default(true),
      ttlHours: z.number().positive().default(24),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  allowlist: [],
  cache: { enabled: true, ttlHours: 24 },
};

export function configPath(): string {
  return process.env.PATCHPILOT_CONFIG ?? join(homedir(), '.patchpilot.json');
}

export function loadConfig(): Config {
  let raw: string;
  try {
    raw = readFileSync(configPath(), 'utf8');
  } catch {
    // No config file is the normal case.
    return DEFAULT_CONFIG;
  }

  try {
    return ConfigSchema.parse(JSON.parse(raw));
  } catch (err) {
    // Malformed config must never block installs — warn and use defaults.
    const message = err instanceof Error ? err.message : 'parse error';
    process.stderr.write(`patchpilot: ignoring invalid config at ${configPath()}: ${message}\n`);
    return DEFAULT_CONFIG;
  }
}

// Allowlist entries match either an exact package name or a trailing-`*`
// prefix (e.g. "@types/*" or "@myorg/*"). Matching is case-sensitive; PyPI
// names are already normalized upstream.
export function isAllowlisted(name: string, config: Config): boolean {
  return config.allowlist.some(pattern => {
    if (pattern.endsWith('*')) {
      return name.startsWith(pattern.slice(0, -1));
    }
    return name === pattern;
  });
}
