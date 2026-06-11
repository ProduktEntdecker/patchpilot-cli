import { describe, it, expect } from 'vitest';
import { checkTyposquat, boundedEditDistance } from './typosquat.js';

describe('boundedEditDistance', () => {
  it('computes exact distances within the bound', () => {
    expect(boundedEditDistance('lodash', 'lodash', 2)).toBe(0);
    expect(boundedEditDistance('lodahs', 'lodash', 2)).toBe(1); // transposition = 1 edit (Damerau)
    expect(boundedEditDistance('lodas', 'lodash', 2)).toBe(1);
    expect(boundedEditDistance('ldoahs', 'lodash', 2)).toBe(2); // two transpositions
  });

  it('returns max+1 when the distance exceeds the bound', () => {
    expect(boundedEditDistance('completely', 'different', 2)).toBe(3);
    expect(boundedEditDistance('ab', 'abcdef', 2)).toBe(3); // length diff shortcut
  });
});

describe('checkTyposquat — npm', () => {
  it('flags a transposition typo of a popular package', () => {
    const signal = checkTyposquat('lodahs', 'npm');
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('typosquat');
    expect(signal!.severity).toBe('HIGH');
    expect(signal!.detail).toContain('lodash');
    expect(signal!.suggestion).toContain('lodash');
  });

  it('flags a single-character omission', () => {
    const signal = checkTyposquat('expres', 'npm');
    expect(signal).not.toBeNull();
    expect(signal!.detail).toContain('express');
  });

  it('does not flag the popular package itself', () => {
    expect(checkTyposquat('lodash', 'npm')).toBeNull();
    expect(checkTyposquat('express', 'npm')).toBeNull();
    expect(checkTyposquat('react', 'npm')).toBeNull();
  });

  it('does not flag popular scoped packages', () => {
    expect(checkTyposquat('@types/node', 'npm')).toBeNull();
    expect(checkTyposquat('@babel/core', 'npm')).toBeNull();
  });

  it('flags typos within a scoped package name', () => {
    const signal = checkTyposquat('@typse/node', 'npm');
    expect(signal).not.toBeNull();
    expect(signal!.detail).toContain('@types/node');
  });

  it('ignores names that are far from every popular package', () => {
    expect(checkTyposquat('my-internal-company-toolkit', 'npm')).toBeNull();
  });

  it('skips very short names entirely (too noisy)', () => {
    expect(checkTyposquat('vu', 'npm')).toBeNull();
    expect(checkTyposquat('rxt', 'npm')).toBeNull();
  });

  it('flags 1-edit variants of short popular names', () => {
    // "reactt" (insertion) and "raect" (transposition) are both 1 edit from "react"
    expect(checkTyposquat('reactt', 'npm')).not.toBeNull();
    expect(checkTyposquat('raect', 'npm')).not.toBeNull();
  });

  it('does not flag 2-edit variants of names shorter than 8 chars', () => {
    // distance 2 from "react", candidate too short for the 2-edit threshold
    expect(checkTyposquat('raecht', 'npm')).toBeNull();
  });
});

describe('checkTyposquat — pypi', () => {
  it('flags a transposition typo of requests', () => {
    const signal = checkTyposquat('reqeusts', 'pypi');
    expect(signal).not.toBeNull();
    expect(signal!.detail).toContain('requests');
  });

  it('applies PEP 503 normalization before matching', () => {
    // Django (capitalized) IS the popular package "django"
    expect(checkTyposquat('Django', 'pypi')).toBeNull();
    // python_dateutil normalizes to python-dateutil (popular) — not a squat
    expect(checkTyposquat('python_dateutil', 'pypi')).toBeNull();
  });

  it('flags near-misses of normalized names', () => {
    const signal = checkTyposquat('python-dateutils', 'pypi');
    expect(signal).not.toBeNull();
    expect(signal!.detail).toContain('python-dateutil');
  });
});

describe('checkTyposquat — homebrew', () => {
  it('is skipped for homebrew packages', () => {
    expect(checkTyposquat('wgett', 'homebrew')).toBeNull();
  });
});
