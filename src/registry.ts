export type Ecosystem = 'npm' | 'pypi' | 'homebrew';

// Thresholds — all constants for easy tuning
const VERSION_QUARANTINE_HOURS = 72;
const PACKAGE_FRESHNESS_DAYS = 7;
const LOW_DOWNLOAD_THRESHOLD = 100;
const REGISTRY_TIMEOUT_MS = 3000;

export interface SupplyChainSignal {
  type: 'version-quarantine' | 'new-package' | 'low-downloads' | 'typosquat';
  severity: 'HIGH' | 'MEDIUM';
  detail: string;
  suggestion?: string;
}

export interface RegistryResult {
  status: 'success' | 'error';
  signals: SupplyChainSignal[];
  previousStableVersion?: string;
}

function hoursAgo(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);
}

function daysAgo(isoDate: string): number {
  return hoursAgo(isoDate) / 24;
}

function formatAge(hours: number): string {
  if (hours < 1) return 'less than 1 hour ago';
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// Matches npm-style (-alpha, -beta) and PEP 440-style (1.0a1, 1.0b2, 1.0rc1, 1.0.dev1)
const PRE_RELEASE_PATTERN = /-(alpha|beta|rc|canary|dev|preview|next|experimental)|[\d](a|b|rc)\d|\.dev\d|\.post\d/i;

function findPreviousStableVersion(
  timeMap: Record<string, string>,
  currentVersion: string
): string | undefined {
  // Get all versions sorted by publish date, newest first
  const versions = Object.entries(timeMap)
    .filter(([key]) => key !== 'created' && key !== 'modified')
    .sort(([, a], [, b]) => new Date(b).getTime() - new Date(a).getTime());

  let foundCurrent = false;
  for (const [version, publishDate] of versions) {
    if (version === currentVersion) {
      foundCurrent = true;
      continue;
    }
    if (!foundCurrent) continue;

    // Skip pre-release versions
    if (PRE_RELEASE_PATTERN.test(version)) continue;

    // Must be older than quarantine window
    if (hoursAgo(publishDate) >= VERSION_QUARANTINE_HOURS) {
      return version;
    }
  }

  return undefined;
}

interface NpmRegistryResponse {
  time?: Record<string, string>;
  maintainers?: Array<{ name?: string }>;
  'dist-tags'?: Record<string, string>;
}

interface NpmDownloadsResponse {
  downloads?: number;
}

interface PyPIResponse {
  info?: { name?: string };
  releases?: Record<string, Array<{ upload_time_iso_8601?: string }>>;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkNpm(
  name: string,
  version: string | undefined
): Promise<RegistryResult> {
  const encodedName = name.startsWith('@') ? name.replace('/', '%2F') : name;

  // Fetch registry metadata and downloads in parallel; downloads failure shouldn't lose registry signals
  const [registryResult, downloadsResult] = await Promise.allSettled([
    fetchWithTimeout(`https://registry.npmjs.org/${encodedName}`, REGISTRY_TIMEOUT_MS),
    fetchWithTimeout(
      `https://api.npmjs.org/downloads/point/last-week/${encodedName}`,
      REGISTRY_TIMEOUT_MS
    ),
  ]);

  if (registryResult.status === 'rejected' || !registryResult.value.ok) {
    return { status: 'success', signals: [] };
  }
  const registryResp = registryResult.value;
  const downloadsResp = downloadsResult.status === 'fulfilled' ? downloadsResult.value : null;

  const data = (await registryResp.json()) as NpmRegistryResponse;
  const timeMap = data.time ?? {};

  // Resolve "latest" version if none specified
  const resolvedVersion = version ?? data['dist-tags']?.latest;

  const signals: SupplyChainSignal[] = [];
  let previousStableVersion: string | undefined;

  // H1: Version Quarantine
  if (resolvedVersion && timeMap[resolvedVersion]) {
    const versionAge = hoursAgo(timeMap[resolvedVersion]);
    if (versionAge < VERSION_QUARANTINE_HOURS) {
      previousStableVersion = findPreviousStableVersion(timeMap, resolvedVersion);
      const suggestion = previousStableVersion
        ? `Consider using ${name}@${previousStableVersion} instead.`
        : undefined;

      signals.push({
        type: 'version-quarantine',
        severity: 'HIGH',
        detail: `${name}@${resolvedVersion} was published ${formatAge(versionAge)} (within ${VERSION_QUARANTINE_HOURS}h quarantine window).`,
        suggestion,
      });
    }
  }

  // H2: New Package Detection
  if (timeMap.created) {
    const packageAge = daysAgo(timeMap.created);
    if (packageAge < PACKAGE_FRESHNESS_DAYS) {
      signals.push({
        type: 'new-package',
        severity: 'HIGH',
        detail: `${name} was created ${formatAge(packageAge * 24)}. This package has no established history.`,
      });
    }
  }

  // H3: Low Download Count
  if (downloadsResp?.ok) {
    const dlData = (await downloadsResp.json()) as NpmDownloadsResponse;
    const downloads = dlData.downloads ?? 0;
    if (downloads < LOW_DOWNLOAD_THRESHOLD) {
      signals.push({
        type: 'low-downloads',
        severity: 'MEDIUM',
        detail: `${name} has ${downloads} weekly downloads on npm.`,
      });
    }
  }

  return { status: 'success', signals, previousStableVersion };
}

async function checkPyPI(
  name: string,
  version: string | undefined
): Promise<RegistryResult> {
  const resp = await fetchWithTimeout(
    `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
    REGISTRY_TIMEOUT_MS
  );

  if (!resp.ok) return { status: 'success', signals: [] };

  const data = (await resp.json()) as PyPIResponse;
  const releases = data.releases ?? {};
  const signals: SupplyChainSignal[] = [];

  // Find the earliest release date (package creation)
  let earliestDate: string | undefined;
  for (const files of Object.values(releases)) {
    if (files?.[0]?.upload_time_iso_8601) {
      if (!earliestDate || files[0].upload_time_iso_8601 < earliestDate) {
        earliestDate = files[0].upload_time_iso_8601;
      }
    }
  }

  // H2: New Package Detection
  if (earliestDate) {
    const packageAge = daysAgo(earliestDate);
    if (packageAge < PACKAGE_FRESHNESS_DAYS) {
      signals.push({
        type: 'new-package',
        severity: 'HIGH',
        detail: `${name} was created ${formatAge(packageAge * 24)}. This package has no established history.`,
      });
    }
  }

  // H1: Version Quarantine
  // PyPI does not guarantee release order — find latest by upload timestamp
  const resolvedVersion = version ?? (() => {
    let latestVersion: string | undefined;
    let latestTime = '';
    for (const [v, files] of Object.entries(releases)) {
      const uploadTime = files?.[0]?.upload_time_iso_8601;
      if (uploadTime && uploadTime > latestTime) {
        latestTime = uploadTime;
        latestVersion = v;
      }
    }
    return latestVersion;
  })();
  if (resolvedVersion && releases[resolvedVersion]?.[0]?.upload_time_iso_8601) {
    const versionAge = hoursAgo(releases[resolvedVersion][0].upload_time_iso_8601);
    if (versionAge < VERSION_QUARANTINE_HOURS) {
      // Find previous stable version by timestamp (PyPI order not guaranteed)
      let previousStableVersion: string | undefined;
      let bestPreviousTime = '';
      for (const [v, files] of Object.entries(releases)) {
        if (v === resolvedVersion) continue;
        if (PRE_RELEASE_PATTERN.test(v)) continue;
        const uploadTime = files?.[0]?.upload_time_iso_8601;
        if (uploadTime && hoursAgo(uploadTime) >= VERSION_QUARANTINE_HOURS && uploadTime > bestPreviousTime) {
          bestPreviousTime = uploadTime;
          previousStableVersion = v;
        }
      }

      const suggestion = previousStableVersion
        ? `Consider using ${name}==${previousStableVersion} instead.`
        : undefined;

      signals.push({
        type: 'version-quarantine',
        severity: 'HIGH',
        detail: `${name}==${resolvedVersion} was published ${formatAge(versionAge)} (within ${VERSION_QUARANTINE_HOURS}h quarantine window).`,
        suggestion,
      });

      return { status: 'success', signals, previousStableVersion };
    }
  }

  return { status: 'success', signals };
}

export async function checkRegistryMetadata(
  name: string,
  version: string | undefined,
  ecosystem: Ecosystem
): Promise<RegistryResult> {
  // Homebrew has no registry API
  if (ecosystem === 'homebrew') {
    return { status: 'success', signals: [] };
  }

  // Fail-open: any error returns empty signals
  try {
    if (ecosystem === 'npm') {
      return await checkNpm(name, version);
    }
    if (ecosystem === 'pypi') {
      return await checkPyPI(name, version);
    }
    return { status: 'success', signals: [] };
  } catch {
    return { status: 'success', signals: [] };
  }
}
