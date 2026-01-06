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

// Placeholder - to be implemented
// Issue #1: CLI scaffold
// Issue #2: Command parser
// Issue #3: OSV API integration
// Issue #4: Decision engine

console.log('PatchPilot CLI - Not yet implemented');
process.exit(0);
