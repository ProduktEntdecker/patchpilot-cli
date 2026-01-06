export type Ecosystem = 'npm' | 'pypi' | 'homebrew';

export type Vulnerability = {
  id: string;
  summary: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
};

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

  const dbSev = (v as any)?.database_specific?.severity as string | undefined;
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

function ecosystemSafe(e: Ecosystem): Ecosystem {
  if (e === 'npm' || e === 'pypi' || e === 'homebrew') return e;
  return 'npm';
}

export async function checkPackageVulnerabilities(
  name: string,
  version: string | undefined,
  ecosystem: Ecosystem
): Promise<Vulnerability[]> {
  if (!name || !name.trim()) return [];

  const osvEcosystem = mapEcosystem(ecosystemSafe(ecosystem));
  const pkgName = name.trim();

  const body: any = {
    package: { name: pkgName, ecosystem: osvEcosystem },
  };
  if (version && version.trim()) {
    body.version = version.trim();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      return [];
    }

    const data = (await resp.json()) as { vulns?: OSVVulnerability[] };
    const vulns = Array.isArray(data?.vulns) ? data.vulns : [];

    return vulns.map(v => ({
      id: chooseId(v),
      summary: v.summary ?? '',
      severity: coerceSeverity(v),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
