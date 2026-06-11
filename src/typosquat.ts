import type { Ecosystem } from './osv.js';
import type { SupplyChainSignal } from './registry.js';
import { POPULAR_NPM_PACKAGES, POPULAR_PYPI_PACKAGES } from './data/popular-packages.js';

// Names shorter than this are too noisy for edit-distance comparison.
const MIN_NAME_LENGTH = 4;
// Two edits are only meaningful on longer names; one edit on short names
// already produces false positives ("vue" vs "vie").
const TWO_EDIT_MIN_LENGTH = 8;

// PEP 503: PyPI treats case and -/_/. runs as equivalent.
function normalizePypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

// Damerau-Levenshtein (OSA variant) distance, bounded: returns max + 1 as
// soon as the distance provably exceeds max, so the popular-list scan stays
// cheap. Transpositions count as 1 edit — they are the most common typo
// ("lodahs") and plain Levenshtein would count them as 2.
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prevPrev: number[] | undefined;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prevPrev![j - 2] + 1);
      }
      curr[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

function maxEditDistance(name: string): number {
  if (name.length >= TWO_EDIT_MIN_LENGTH) return 2;
  if (name.length >= MIN_NAME_LENGTH) return 1;
  return 0;
}

// Offline check: is `name` a near-miss of a popular package it is not
// identical to? Returns a supply chain signal, or null when clean.
export function checkTyposquat(name: string, ecosystem: Ecosystem): SupplyChainSignal | null {
  if (ecosystem === 'homebrew') return null;

  const popular = ecosystem === 'npm' ? POPULAR_NPM_PACKAGES : POPULAR_PYPI_PACKAGES;
  const candidate = ecosystem === 'pypi' ? normalizePypiName(name) : name.toLowerCase();

  // The package IS a popular one — by definition not a squat of itself.
  if (popular.has(candidate)) return null;

  const maxDist = maxEditDistance(candidate);
  if (maxDist === 0) return null;

  let bestMatch: string | undefined;
  let bestDist = maxDist + 1;
  for (const popularName of popular) {
    if (popularName.length < MIN_NAME_LENGTH) continue;
    const dist = boundedEditDistance(candidate, popularName, maxDist);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = popularName;
      if (dist === 1) break; // cannot get closer than 1 (0 is excluded above)
    }
  }

  if (!bestMatch || bestDist > maxDist) return null;

  const edits = bestDist === 1 ? '1 edit' : `${bestDist} edits`;
  return {
    type: 'typosquat',
    severity: 'HIGH',
    detail: `"${name}" is ${edits} away from the popular package "${bestMatch}" — possible typosquat.`,
    suggestion: `Did you mean "${bestMatch}"?`,
  };
}
