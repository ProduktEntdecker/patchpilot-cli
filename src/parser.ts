import { parse } from 'shell-quote';

export interface ParsedPackage {
  name: string;
  version?: string;
  ecosystem: 'npm' | 'pypi' | 'homebrew';
}

type ParsedToken = string | { op: string } | { comment: string } | { pattern: string };

function isOperator(token: ParsedToken): token is { op: string } {
  return typeof token === 'object' && 'op' in token;
}

function extractCommands(input: string): string[][] {
  const tokens = parse(input);
  const commands: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (isOperator(token)) {
      if (['&&', '||', ';', '|'].includes(token.op) && current.length > 0) {
        commands.push(current);
        current = [];
      }
    } else if (typeof token === 'string') {
      // Skip environment variable assignments (KEY=value before command)
      if (current.length === 0 && token.includes('=') && !token.startsWith('-')) {
        continue;
      }
      current.push(token);
    }
  }

  if (current.length > 0) {
    commands.push(current);
  }

  return commands;
}

function parseNestedCommand(args: string[]): string[][] {
  // Handle: bash -c "npm install pkg", sh -c "pip install pkg"
  const shellBinaries = ['bash', 'sh', 'zsh', '/bin/bash', '/bin/sh', '/bin/zsh'];
  if (args.length >= 3 && shellBinaries.includes(args[0]) && args[1] === '-c') {
    return extractCommands(args.slice(2).join(' '));
  }
  return [args];
}

function parsePackagesFromArgs(args: string[], ecosystem: ParsedPackage['ecosystem']): ParsedPackage[] {
  const packages: ParsedPackage[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) continue; // Skip flags

    if (ecosystem === 'npm' || ecosystem === 'homebrew') {
      const lastAt = arg.lastIndexOf('@');
      if (lastAt > 0) {
        packages.push({ name: arg.substring(0, lastAt), version: arg.substring(lastAt + 1), ecosystem });
      } else {
        packages.push({ name: arg, ecosystem });
      }
    } else if (ecosystem === 'pypi') {
      const idx = arg.indexOf('==');
      if (idx > 0) {
        packages.push({ name: arg.substring(0, idx), version: arg.substring(idx + 2), ecosystem });
      } else {
        packages.push({ name: arg, ecosystem });
      }
    }
  }

  return packages;
}

function detectInstallCommand(args: string[]): { ecosystem: ParsedPackage['ecosystem']; packageArgs: string[] } | null {
  if (args.length < 2) return null;

  const cmd = args[0];
  const subcmd = args[1];

  // npm install, npm i, npm add, npx install
  if ((cmd === 'npm' || cmd === 'npx') && ['install', 'i', 'add'].includes(subcmd)) {
    return { ecosystem: 'npm', packageArgs: args.slice(2) };
  }

  // pip install, pip3 install
  if ((cmd === 'pip' || cmd === 'pip3') && subcmd === 'install') {
    return { ecosystem: 'pypi', packageArgs: args.slice(2) };
  }

  // brew install
  if (cmd === 'brew' && subcmd === 'install') {
    return { ecosystem: 'homebrew', packageArgs: args.slice(2) };
  }

  return null;
}

export function parseInstallCommand(command: string): ParsedPackage[] | null {
  const allPackages: ParsedPackage[] = [];

  // Extract all commands from the input (handles &&, ||, ;, |)
  const commands = extractCommands(command);

  for (const args of commands) {
    // Check for nested shell commands
    const nestedCommands = parseNestedCommand(args);

    for (const nested of nestedCommands) {
      const install = detectInstallCommand(nested);
      if (install) {
        const packages = parsePackagesFromArgs(install.packageArgs, install.ecosystem);
        allPackages.push(...packages);
      }
    }
  }

  return allPackages.length > 0 ? allPackages : null;
}
