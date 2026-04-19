export type Ecosystem = 'npm' | 'pypi' | 'homebrew';

export type Vulnerability = {
  id: string;
  summary: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
};

// Result type that distinguishes between "no vulnerabilities" and "check failed"
export type CheckResult =
  | { status: 'success'; vulnerabilities: Vulnerability[]; resolvedVersion?: string }
  | { status: 'error'; error: string };

type OSVVulnerability = {
  id: string;
  summary?: string;
  aliases?: string[];
  severity?: Array<{
    type?: string;
    score?: string | number;
  }>;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{
      type?: string;
      events?: Array<{ introduced?: string; fixed?: string; last_affected?: string }>;
    }>;
    versions?: string[];
  }>;
  database_specific?: Record<string, unknown> & { severity?: string };
};

function mapEcosystem(ecosystem: Ecosystem): string {
  switch (ecosystem) {
    case 'npm':
      return 'npm';
    case 'pypi':
      return 'PyPI';
    case 'homebrew':
      return 'Homebrew';
  }
}

function labelFromCvssScore(scoreNum: number): Vulnerability['severity'] {
  if (isNaN(scoreNum)) return 'UNKNOWN';
  if (scoreNum >= 9.0) return 'CRITICAL';
  if (scoreNum >= 7.0) return 'HIGH';
  if (scoreNum >= 4.0) return 'MEDIUM';
  if (scoreNum > 0.0) return 'LOW';
  return 'UNKNOWN';
}

function coerceSeverity(v: OSVVulnerability): Vulnerability['severity'] {
  if (Array.isArray(v.severity) && v.severity.length > 0) {
    let best: Vulnerability['severity'] = 'UNKNOWN';
    const order: Record<Vulnerability['severity'], number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
      UNKNOWN: 0,
    };

    for (const s of v.severity) {
      const val = typeof s?.score === 'number' ? s.score : parseFloat(String(s?.score ?? ''));
      const label = labelFromCvssScore(val);
      if (order[label] > order[best]) best = label;
    }
    if (best !== 'UNKNOWN') return best;
  }

  const dbSev = v.database_specific?.severity;
  if (typeof dbSev === 'string') {
    const upper = dbSev.toUpperCase();
    if (upper.includes('CRITICAL')) return 'CRITICAL';
    if (upper.includes('HIGH')) return 'HIGH';
    if (upper.includes('MEDIUM')) return 'MEDIUM';
    if (upper.includes('LOW')) return 'LOW';
  }

  return 'UNKNOWN';
}

function chooseId(v: OSVVulnerability): string {
  const aliases = Array.isArray(v.aliases) ? v.aliases : [];
  const cve = aliases.find(a => /^CVE-\d{4}-\d{4,}$/.test(a));
  return cve ?? v.id;
}

// OSV API request body type
interface OSVQueryRequest {
  package: { name: string; ecosystem: string };
  version?: string;
}

// Short timeout for latest-version resolution; falls back gracefully on failure.
const LATEST_RESOLVE_TIMEOUT_MS = 2000;

// Resolve the actual version string when none was specified by the user.
// Without this, OSV returns vulnerabilities across ALL versions ever published,
// flagging packages whose current release is patched (false positive).
async function resolveLatestVersion(
  name: string,
  ecosystem: Ecosystem
): Promise<string | undefined> {
  let url: string;
  if (ecosystem === 'npm') {
    // /latest endpoint returns just the latest manifest (smaller than full registry doc)
    const encoded = name.startsWith('@') ? name.replace('/', '%2F') : encodeURIComponent(name);
    url = `https://registry.npmjs.org/${encoded}/latest`;
  } else if (ecosystem === 'pypi') {
    url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
  } else {
    return undefined;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LATEST_RESOLVE_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return undefined;
    const data = (await resp.json()) as { version?: string; info?: { version?: string } };
    return ecosystem === 'pypi' ? data.info?.version : data.version;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkPackageVulnerabilities(
  name: string,
  version: string | undefined,
  ecosystem: Ecosystem
): Promise<CheckResult> {
  if (!name || !name.trim()) {
    return { status: 'success', vulnerabilities: [] };
  }

  const osvEcosystem = mapEcosystem(ecosystem);
  const pkgName = name.trim();

  // If no version was specified, resolve current latest from the registry.
  // Falls back to unversioned OSV query on resolve failure (preserves prior behavior).
  let resolvedVersion: string | undefined;
  if (!version || !version.trim()) {
    resolvedVersion = await resolveLatestVersion(pkgName, ecosystem);
  }
  const effectiveVersion = (version && version.trim()) || resolvedVersion;

  const body: OSVQueryRequest = {
    package: { name: pkgName, ecosystem: osvEcosystem },
  };
  if (effectiveVersion) {
    body.version = effectiveVersion;
  }

  const controller = new AbortController();
  // Reduced timeout to 4s per request (was 8s) to fit within hook budget
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      // FAIL CLOSED: API error = deny, not allow
      return { status: 'error', error: `OSV API returned ${resp.status}` };
    }

    const data = (await resp.json()) as { vulns?: OSVVulnerability[] };
    const vulns = Array.isArray(data?.vulns) ? data.vulns : [];

    return {
      status: 'success',
      vulnerabilities: vulns.map(v => ({
        id: chooseId(v),
        summary: v.summary ?? '',
        severity: coerceSeverity(v),
      })),
      resolvedVersion,
    };
  } catch (err) {
    // FAIL CLOSED: Network error = deny, not allow
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'error', error: `OSV check failed: ${message}` };
  } finally {
    clearTimeout(timeoutId);
  }
}
