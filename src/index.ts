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

import { makeDecision, type Vulnerability } from './decision.js';
import { parseInstallCommand } from './parser.js';
import { checkPackageVulnerabilities, type Vulnerability as OSVVulnerability } from './osv.js';

// Map OSV severity to decision engine severity
function mapSeverity(osvSeverity: OSVVulnerability['severity']): Vulnerability['severity'] {
  switch (osvSeverity) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH': return 'HIGH';
    case 'MEDIUM': return 'MODERATE';
    case 'LOW': return 'LOW';
    case 'UNKNOWN': return 'NONE';
    default: return 'NONE';
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
      typeof (input.tool_input as any).command === 'string'
        ? (input.tool_input as any).command
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

    // Check each checkable package for vulnerabilities
    const allVulnerabilities: Vulnerability[] = [];
    for (const pkg of checkablePackages) {
      const osvVulns = await checkPackageVulnerabilities(pkg.name, pkg.version, pkg.ecosystem);

      // Convert OSV vulnerabilities to decision engine format
      for (const v of osvVulns) {
        allVulnerabilities.push({
          name: pkg.name,
          version: pkg.version || 'latest',
          severity: mapSeverity(v.severity),
        });
      }
    }

    // Make decision based on vulnerabilities
    let { decision, reason } = makeDecision(allVulnerabilities);

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