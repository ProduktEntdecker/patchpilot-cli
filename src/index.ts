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

// Issue #1: CLI scaffold

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

    // Allow all commands for now (Issue #1).
    const decision: 'allow' = 'allow';
    const reason =
      toolName && command ? `Allowing ${toolName} command: ${command}` : 'Allowing command';

    const out = makeOutput(hookEventName, decision, reason);
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(0);
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
