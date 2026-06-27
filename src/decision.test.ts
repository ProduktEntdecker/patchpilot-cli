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

describe('makeFullDecision — signal combination rules', () => {
  const newPackage = { type: 'new-package' as const, severity: 'HIGH' as const, detail: 'created 2 days ago' };
  const installScript = { type: 'install-script' as const, severity: 'MEDIUM' as const, detail: 'runs postinstall' };
  const lowDownloads = { type: 'low-downloads' as const, severity: 'MEDIUM' as const, detail: '3 weekly downloads' };
  const quarantine = { type: 'version-quarantine' as const, severity: 'HIGH' as const, detail: 'published 1h ago' };
  const typosquat = { type: 'typosquat' as const, severity: 'HIGH' as const, detail: '1 edit from lodash' };

  it('denies new package + install script', () => {
    const result = makeFullDecision([], [newPackage, installScript]);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('high-risk supply chain profile');
  });

  it('denies new package + low downloads', () => {
    expect(makeFullDecision([], [newPackage, lowDownloads]).decision).toBe('deny');
  });

  it('denies version quarantine + install script', () => {
    const result = makeFullDecision([], [quarantine, installScript]);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('compromised release');
  });

  it('denies typosquat + install script', () => {
    expect(makeFullDecision([], [typosquat, installScript]).decision).toBe('deny');
  });

  it('only asks for a single new-package signal', () => {
    expect(makeFullDecision([], [newPackage]).decision).toBe('ask');
  });

  it('only asks for a lone install-script signal', () => {
    expect(makeFullDecision([], [installScript]).decision).toBe('ask');
  });

  it('still asks for new package + version quarantine (not a hard-block combo)', () => {
    expect(makeFullDecision([], [newPackage, quarantine]).decision).toBe('ask');
  });
});
