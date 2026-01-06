
export interface Vulnerability {
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
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
  } else if (severities.includes('MODERATE')) {
    decision = 'ask';
  }

  if (decision === 'deny' || decision === 'ask') {
    const criticalCount = severities.filter(s => s === 'CRITICAL').length;
    const highCount = severities.filter(s => s === 'HIGH').length;
    const moderateCount = severities.filter(s => s === 'MODERATE').length;

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

    const vuln = vulnerabilities[0];
    const fixVersion = vuln.fixVersion ? `, recommended fix: ${vuln.fixVersion}` : '';
    reason = `🚨 ${vuln.name}@${vuln.version} has ${parts.join(', ')} vulnerabilities${fixVersion}`;
  } else {
    reason = 'Vulnerabilities found, but none are above LOW severity.';
  }

  return { decision, reason };
}
