import type { SupplyChainSignal } from './registry.js';

export interface Vulnerability {
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN' | 'NONE';
  version: string;
  fixVersion?: string;
}

export type Decision = 'allow' | 'deny' | 'ask';

export interface DecisionResult {
  decision: Decision;
  reason: string;
}

export function makeDecision(vulnerabilities: Vulnerability[]): DecisionResult {
  if (!vulnerabilities || vulnerabilities.length === 0) {
    return { decision: 'allow', reason: 'No vulnerabilities found.' };
  }

  let decision: Decision = 'allow';
  let reason = '';

  const severities = vulnerabilities.map(v => v.severity);

  if (severities.includes('CRITICAL') || severities.includes('HIGH')) {
    decision = 'deny';
  } else if (severities.includes('MODERATE') || severities.includes('UNKNOWN')) {
    // UNKNOWN severity means the advisory exists but carries no score —
    // never treat that as harmless; require user approval.
    decision = 'ask';
  }

  if (decision === 'deny' || decision === 'ask') {
    const criticalCount = severities.filter(s => s === 'CRITICAL').length;
    const highCount = severities.filter(s => s === 'HIGH').length;
    const moderateCount = severities.filter(s => s === 'MODERATE').length;
    const unknownCount = severities.filter(s => s === 'UNKNOWN').length;

    const parts = [];
    if (criticalCount > 0) {
      parts.push(`${criticalCount} CRITICAL`);
    }
    if (highCount > 0) {
      parts.push(`${highCount} HIGH`);
    }
    if (moderateCount > 0) {
      parts.push(`${moderateCount} MODERATE`);
    }
    if (unknownCount > 0) {
      parts.push(`${unknownCount} UNKNOWN severity`);
    }

    const vuln = vulnerabilities[0];
    const fixVersion = vuln.fixVersion ? `, recommended fix: ${vuln.fixVersion}` : '';
    reason = `🚨 ${vuln.name}@${vuln.version} has ${parts.join(', ')} vulnerabilities${fixVersion}`;
  } else {
    reason = 'Vulnerabilities found, but none are above LOW severity.';
  }

  return { decision, reason };
}

export function makeFullDecision(
  vulnerabilities: Vulnerability[],
  signals: SupplyChainSignal[]
): DecisionResult {
  // CVE-based decision first (always takes priority)
  const cveResult = makeDecision(vulnerabilities);

  // If CVE already denies, keep it — supply chain signals don't override
  if (cveResult.decision === 'deny') {
    // Append supply chain context if present
    if (signals.length > 0) {
      const scWarnings = signals.map(s => s.detail).join(' ');
      return { decision: 'deny', reason: `${cveResult.reason} Additionally: ${scWarnings}` };
    }
    return cveResult;
  }

  // Build supply chain reason parts
  if (signals.length === 0) {
    return cveResult;
  }

  const parts: string[] = [];
  for (const signal of signals) {
    let line = `⚠️ ${signal.detail}`;
    if (signal.suggestion) {
      line += ` ${signal.suggestion}`;
    }
    parts.push(line);
  }

  const scReason = parts.join(' ');

  // Combination rules: individually weak signals become decisive together.
  // A brand-new package that also runs install scripts (or has near-zero
  // adoption) is the classic fresh-malware profile — block it outright
  // instead of just asking, which users learn to click through.
  // (CVE deny was already handled above, so escalating to deny here is safe.)
  const dangerousCombo = evaluateSignalCombination(signals);
  if (dangerousCombo) {
    return { decision: 'deny', reason: `🚫 ${dangerousCombo} ${scReason}` };
  }

  // Escalate allow → ask if any supply chain signal fires
  if (cveResult.decision === 'allow') {
    return { decision: 'ask', reason: scReason };
  }

  // CVE was already 'ask' — combine reasons
  return { decision: 'ask', reason: `${cveResult.reason} ${scReason}` };
}

// Returns a human-readable reason when the signal set forms a high-risk
// combination that warrants a hard block, or undefined otherwise.
function evaluateSignalCombination(signals: SupplyChainSignal[]): string | undefined {
  const has = (type: SupplyChainSignal['type']) => signals.some(s => s.type === type);

  const newPackage = has('new-package');
  const quarantine = has('version-quarantine');
  const installScript = has('install-script');
  const lowDownloads = has('low-downloads');
  const typosquat = has('typosquat');

  if (newPackage && installScript) {
    return 'Brand-new package that runs install scripts — high-risk supply chain profile.';
  }
  if (newPackage && lowDownloads) {
    return 'Brand-new package with almost no adoption — high-risk supply chain profile.';
  }
  if (quarantine && installScript) {
    return 'Just-published version that runs install scripts — possible compromised release.';
  }
  if (typosquat && installScript) {
    return 'Likely typosquat that runs install scripts — high-risk supply chain profile.';
  }
  return undefined;
}
