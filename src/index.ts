#!/usr/bin/env node
/**
 * PatchPilot - Security scanner for vibe coders
 *
 * Claude Code pre-execution hook that checks packages for vulnerabilities
 * before installation.
 *
 * Usage: Add to ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "Bash",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "npx patchpilot",
 *         "timeout": 10
 *       }]
 *     }]
 *   }
 * }
 */

import { makeDecision, makeFullDecision, type Vulnerability } from './decision.js';
import { parseInstallCommand, type ParsedPackage } from './parser.js';
import { checkPackageVulnerabilities, type Vulnerability as OSVVulnerability, type CheckResult } from './osv.js';
import { checkRegistryMetadata, type SupplyChainSignal } from './registry.js';
import { checkTyposquat } from './typosquat.js';
import { loadConfig, isAllowlisted } from './config.js';
import { cacheKey, isCachedClean, cacheClean } from './cache.js';

// Per-package check plan. Cached-clean packages skip every check; allowlisted
// packages skip supply-chain checks but still get a CVE/malware check.
interface PackagePlan {
  pkg: ParsedPackage;
  key?: string;
  cachedClean: boolean;
  allowlisted: boolean;
}

// Map OSV severity to decision engine severity
function mapSeverity(osvSeverity: OSVVulnerability['severity']): Vulnerability['severity'] {
  switch (osvSeverity) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH': return 'HIGH';
    case 'MEDIUM': return 'MODERATE';
    case 'LOW': return 'LOW';
    // UNKNOWN must not collapse to NONE: advisories without a CVSS score
    // (common for malware and fresh reports) would silently pass as "allow".
    case 'UNKNOWN': return 'UNKNOWN';
    default: return 'UNKNOWN';
  }
}

type HookInput = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

type HookOutput = {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason: string;
  };
};

function makeOutput(
  hookEventName: string,
  decision: 'allow' | 'deny' | 'ask',
  reason: string
): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => (data += chunk));
      process.stdin.on('end', () => resolve(data.trim()))
        .on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw) {
      const out = makeOutput('PreToolUse', 'deny', 'No input provided on stdin');
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(2);
      return;
    }

    let input: HookInput;
    try {
      input = JSON.parse(raw);
    } catch {
      const out = makeOutput('PreToolUse', 'deny', 'Invalid JSON input');
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(2);
      return;
    }

    const hookEventName =
      typeof input.hook_event_name === 'string' && input.hook_event_name.length
        ? input.hook_event_name
        : 'PreToolUse';

    const toolName = typeof input.tool_name === 'string' ? input.tool_name : undefined;
    const command =
      input.tool_input &&
      typeof input.tool_input === 'object' &&
      typeof input.tool_input.command === 'string'
        ? input.tool_input.command
        : undefined;

    // Skip non-Bash commands
    if (toolName !== 'Bash' || !command) {
      const out = makeOutput(hookEventName, 'allow', 'Not a Bash command, allowing');
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(0);
      return;
    }

    // Parse install command
    const packages = parseInstallCommand(command);
    if (!packages || packages.length === 0) {
      const out = makeOutput(hookEventName, 'allow', 'Not an install command, allowing');
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(0);
      return;
    }

    // Separate packages by ecosystem - Homebrew has no vulnerability database
    const checkablePackages = packages.filter(p => p.ecosystem !== 'homebrew');
    const homebrewPackages = packages.filter(p => p.ecosystem === 'homebrew');

    // If only homebrew packages, return honest message about limitation
    if (checkablePackages.length === 0 && homebrewPackages.length > 0) {
      const pkgNames = homebrewPackages.map(p => p.name).join(', ');
      const out = makeOutput(
        hookEventName,
        'allow',
        `Homebrew packages not checked (${pkgNames}) - no vulnerability database available. Allowing by default.`
      );
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(0);
      return;
    }

    // Load user config (allowlist + cache); fail-safe to defaults on error.
    const config = loadConfig();

    // Build a per-package plan. A cached-clean result skips all checks; an
    // allowlisted package skips supply-chain checks but is still CVE-checked.
    const plans: PackagePlan[] = checkablePackages.map(pkg => {
      const key = pkg.version ? cacheKey(pkg.ecosystem, pkg.name, pkg.version) : undefined;
      const cachedClean = config.cache.enabled && key ? isCachedClean(key) : false;
      return { pkg, key, cachedClean, allowlisted: isAllowlisted(pkg.name, config) };
    });

    const osvTargets = plans.filter(p => !p.cachedClean);
    const registryTargets = plans.filter(p => !p.cachedClean && !p.allowlisted);

    // PARALLEL: OSV (fail-closed) + registry metadata (fail-open)
    const [checkResults, registryResults] = await Promise.all([
      Promise.all(
        osvTargets.map(plan =>
          checkPackageVulnerabilities(plan.pkg.name, plan.pkg.version, plan.pkg.ecosystem)
            .then(result => ({ plan, result }))
        )
      ),
      Promise.all(
        registryTargets.map(plan =>
          checkRegistryMetadata(plan.pkg.name, plan.pkg.version, plan.pkg.ecosystem)
            .then(result => ({ plan, result }))
        )
      ),
    ]);

    // FAIL CLOSED: If any OSV check failed, deny the install
    const errors: string[] = [];
    const allVulnerabilities: Vulnerability[] = [];
    const osvCleanPlans = new Set<PackagePlan>();

    for (const { plan, result } of checkResults) {
      if (result.status === 'error') {
        errors.push(`${plan.pkg.name}: ${result.error}`);
      } else {
        if (result.vulnerabilities.length === 0) osvCleanPlans.add(plan);
        // Use resolvedVersion (from registry lookup) when no version was specified,
        // so messages show the real version instead of misleading "latest".
        const displayVersion = plan.pkg.version || result.resolvedVersion || 'latest';
        for (const v of result.vulnerabilities) {
          allVulnerabilities.push({
            name: plan.pkg.name,
            version: displayVersion,
            severity: mapSeverity(v.severity),
          });
        }
      }
    }

    // If any vulnerability checks failed, deny with explanation
    if (errors.length > 0) {
      const out = makeOutput(
        hookEventName,
        'deny',
        `Security check failed (denying by default): ${errors.join('; ')}`
      );
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(2);
      return;
    }

    // Collect supply chain signals (fail-open: errors silently ignored)
    const allSignals: SupplyChainSignal[] = [];
    const plansWithSignals = new Set<PackagePlan>();
    for (const { plan, result } of registryResults) {
      if (result.status === 'success' && result.signals.length > 0) {
        allSignals.push(...result.signals);
        plansWithSignals.add(plan);
      }
    }

    // Typosquat detection runs offline against the embedded popular-package list
    for (const plan of registryTargets) {
      const squat = checkTyposquat(plan.pkg.name, plan.pkg.ecosystem);
      if (squat) {
        allSignals.push(squat);
        plansWithSignals.add(plan);
      }
    }

    // Cache packages that were fully checked (versioned, not allowlisted) and
    // came back completely clean — only `allow` results are ever cached.
    if (config.cache.enabled) {
      const cleanKeys = registryTargets
        .filter(p => p.key && osvCleanPlans.has(p) && !plansWithSignals.has(p))
        .map(p => p.key as string);
      cacheClean(cleanKeys, config.cache.ttlHours);
    }

    // Make decision based on CVE vulnerabilities + supply chain signals
    let { decision, reason } = makeFullDecision(allVulnerabilities, allSignals);

    // Add note about unchecked homebrew packages if any
    if (homebrewPackages.length > 0) {
      const pkgNames = homebrewPackages.map(p => p.name).join(', ');
      reason += ` Note: Homebrew packages not checked (${pkgNames}) - no vulnerability database available.`;
    }

    const out = makeOutput(hookEventName, decision, reason);
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(decision === 'deny' ? 2 : 0);
  } catch {
    const out = makeOutput('PreToolUse', 'deny', 'Unhandled error running hook');
    try {
      process.stdout.write(JSON.stringify(out) + '\n');
    } catch {}
    process.exit(2);
  }
}

// Run main when executed directly
main();