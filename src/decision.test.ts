import { describe, it, expect } from 'vitest';
import { makeDecision, makeFullDecision, type Vulnerability } from './decision.js';

function vuln(severity: Vulnerability['severity'], name = 'some-pkg'): Vulnerability {
  return { name, severity, version: '1.0.0' };
}

describe('makeDecision', () => {
  it('allows when there are no vulnerabilities', () => {
    expect(makeDecision([]).decision).toBe('allow');
  });

  it('denies on CRITICAL', () => {
    expect(makeDecision([vuln('CRITICAL')]).decision).toBe('deny');
  });

  it('denies on HIGH', () => {
    expect(makeDecision([vuln('HIGH')]).decision).toBe('deny');
  });

  it('asks on MODERATE', () => {
    expect(makeDecision([vuln('MODERATE')]).decision).toBe('ask');
  });

  it('asks on UNKNOWN severity instead of allowing', () => {
    // Regression: advisories without a CVSS score (e.g. MAL-* malware
    // entries before they are mapped to CRITICAL, or fresh unscored
    // reports) must never silently pass.
    const result = makeDecision([vuln('UNKNOWN')]);
    expect(result.decision).toBe('ask');
    expect(result.reason).toContain('UNKNOWN severity');
  });

  it('allows on LOW only', () => {
    const result = makeDecision([vuln('LOW')]);
    expect(result.decision).toBe('allow');
  });

  it('deny takes priority over UNKNOWN in mixed results', () => {
    expect(makeDecision([vuln('UNKNOWN'), vuln('CRITICAL')]).decision).toBe('deny');
  });
});

describe('makeFullDecision', () => {
  it('escalates UNKNOWN-severity vulnerabilities to ask without supply chain signals', () => {
    const result = makeFullDecision([vuln('UNKNOWN')], []);
    expect(result.decision).toBe('ask');
  });

  it('keeps deny when supply chain signals are also present', () => {
    const result = makeFullDecision([vuln('CRITICAL')], [
      { type: 'new-package', severity: 'HIGH', detail: 'Package created 2 days ago.' },
    ]);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('Package created 2 days ago.');
  });
});
