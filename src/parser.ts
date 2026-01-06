import { parse } from 'shell-quote';

export interface ParsedPackage {
  name: string;
  version?: string;
  ecosystem: 'npm' | 'pypi' | 'homebrew';
}

// P1-004: Type for shell-quote parse results
// shell-quote returns: string | { op: string } | { op: "glob"; pattern: string } | { comment: string }
type ShellToken = ReturnType<typeof parse>[number];

// Check if token is a control operator (has 'op' but not 'pattern')
function getOperator(token: ShellToken): string | null {
  if (typeof token === 'object' && token !== null && 'op' in token && !('pattern' in token)) {
    return (token as { op: string }).op;
  }
  return null;
}

// P1-001: Command wrappers that should be stripped
// Extended with bypasses found in security audit
const COMMAND_WRAPPERS = new Set([
  // Original
  'env', 'sudo', 'doas', 'exec', 'eval', 'command', 'builtin',
  'nice', 'ionice', 'nohup', 'timeout', 'time', 'strace', 'ltrace',
  // Added from security audit - macOS/Linux utilities
  'caffeinate',  // macOS keep-awake
  'watch',       // repeat command
  'xargs',       // pipe to command
  'parallel',    // GNU parallel
  'setsid',      // run in new session
  'daemonize',   // daemonize process
  'at',          // scheduled execution
  'batch',       // batch execution
  'trickle',     // bandwidth limiter
  'proxychains', // proxy wrapper
  'tsocks',      // transparent SOCKS
  'firejail',    // sandbox
  'sandbox-exec', // macOS sandbox
  'script',      // typescript wrapper
  'unbuffer',    // expect unbuffer
  'pty-run',     // pty wrapper
]);

// Command separating operators
const COMMAND_SEPARATORS = new Set(['&&', '||', ';', '|']);

// Shell binaries for nested command detection (use basename matching)
const SHELL_NAMES = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash', 'csh', 'tcsh', 'fish']);

// Environment variable pattern: KEY=value (standard format)
const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;

function extractCommands(input: string): string[][] {
  const tokens = parse(input);
  const commands: string[][] = [];
  let currentCommandTokens: string[] = [];

  for (const token of tokens) {
    const op = getOperator(token);
    if (op !== null) {
      if (COMMAND_SEPARATORS.has(op) && currentCommandTokens.length > 0) {
        commands.push(currentCommandTokens);
        currentCommandTokens = [];
      }
    } else if (typeof token === 'string') {
      // Skip environment variable assignments (KEY=value before command)
      if (currentCommandTokens.length === 0 && ENV_VAR_PATTERN.test(token)) {
        continue;
      }
      currentCommandTokens.push(token);
    }
  }

  if (currentCommandTokens.length > 0) {
    commands.push(currentCommandTokens);
  }

  return commands;
}

// P1-001: Strip command wrappers like env, sudo, exec, etc.
// SECURITY FIX: Also handle eval "quoted command" by parsing the quoted string
function unwrapCommand(args: string[]): string[] {
  let unwrapped = [...args];

  while (unwrapped.length > 0) {
    const cmd = unwrapped[0];
    // Check basename for path-prefixed commands like /usr/bin/env
    const basename = cmd.split('/').pop() || '';

    if (COMMAND_WRAPPERS.has(cmd) || COMMAND_WRAPPERS.has(basename)) {
      // SECURITY FIX: Handle eval with quoted argument
      // eval "npm install malicious" - the quoted part becomes a single token
      if ((cmd === 'eval' || basename === 'eval') && unwrapped.length >= 2) {
        const evalArg = unwrapped[1];
        // If eval's argument looks like a command string, parse it
        if (evalArg && !evalArg.startsWith('-')) {
          // Parse the eval argument as a new command
          const parsedEval = parse(evalArg);
          const evalTokens = parsedEval
            .filter((t): t is string => typeof t === 'string')
            .filter(t => !ENV_VAR_PATTERN.test(t));
          if (evalTokens.length > 0) {
            unwrapped = evalTokens;
            continue; // Re-process in case there are nested wrappers
          }
        }
      }

      unwrapped = unwrapped.slice(1);
      // Skip flags for commands that take them (sudo -u root, timeout 60, etc.)
      while (unwrapped.length > 0 && unwrapped[0].startsWith('-')) {
        // Handle flags with values: -u root, --user=root
        if (unwrapped[0].includes('=')) {
          unwrapped = unwrapped.slice(1);
        } else if (['-u', '-g', '-C', '-D'].includes(unwrapped[0])) {
          // Flags that take a separate argument
          unwrapped = unwrapped.slice(2);
        } else {
          unwrapped = unwrapped.slice(1);
        }
      }
      // Handle timeout's duration argument (first non-flag arg)
      if (basename === 'timeout' && unwrapped.length > 0 && /^\d+/.test(unwrapped[0])) {
        unwrapped = unwrapped.slice(1);
      }
      // Handle watch's interval argument
      if (basename === 'watch' && unwrapped.length > 0 && /^\d+/.test(unwrapped[0])) {
        unwrapped = unwrapped.slice(1);
      }
    } else {
      break;
    }
  }

  return unwrapped;
}

// Check if command is a shell binary (handles full paths)
function isShellBinary(cmd: string): boolean {
  const basename = cmd.split('/').pop() || '';
  return SHELL_NAMES.has(basename);
}

// Handle nested shell commands with recursion
function parseNestedCommand(args: string[], depth = 0): string[][] {
  // Prevent infinite recursion
  if (depth > 3) return [args];

  if (args.length >= 3 && isShellBinary(args[0]) && args[1] === '-c') {
    const nested = extractCommands(args.slice(2).join(' '));
    return nested.flatMap(cmd => parseNestedCommand(cmd, depth + 1));
  }
  return [args];
}

function parsePackagesFromArgs(args: string[], ecosystem: ParsedPackage['ecosystem']): ParsedPackage[] {
  const packages: ParsedPackage[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) continue; // Skip flags
    if (arg.startsWith('.') || arg.startsWith('/')) continue; // Skip local paths

    if (ecosystem === 'npm' || ecosystem === 'homebrew') {
      const lastAt = arg.lastIndexOf('@');
      if (lastAt > 0) {
        packages.push({ name: arg.substring(0, lastAt), version: arg.substring(lastAt + 1), ecosystem });
      } else {
        packages.push({ name: arg, ecosystem });
      }
    } else if (ecosystem === 'pypi') {
      // Handle pip extras like requests[security] and versions like requests==2.28.0
      // Can have: requests, requests==2.0, requests[security], requests[security]==2.0
      let pkgPart = arg;
      let version: string | undefined;

      // First extract version if present (look for == in full string)
      const versionIdx = arg.indexOf('==');
      if (versionIdx > 0) {
        version = arg.substring(versionIdx + 2);
        pkgPart = arg.substring(0, versionIdx);
      }

      // Then remove extras bracket from package name
      const bracketIdx = pkgPart.indexOf('[');
      const pkgName = bracketIdx > 0 ? pkgPart.substring(0, bracketIdx) : pkgPart;

      if (version) {
        packages.push({ name: pkgName, version, ecosystem });
      } else {
        packages.push({ name: pkgName, ecosystem });
      }
    }
  }

  return packages;
}

type DetectResult = { ecosystem: ParsedPackage['ecosystem']; packageArgs: string[] };

// Extract basename from potentially path-prefixed command
function getBasename(cmd: string): string {
  return cmd.split('/').pop() || cmd;
}

function detectInstallCommand(args: string[]): DetectResult | null {
  if (args.length < 1) return null;

  // P1-001: First unwrap any command wrappers
  const unwrapped = unwrapCommand(args);
  if (unwrapped.length < 1) return null;

  // SECURITY FIX: Extract basename to handle /usr/bin/npm, ~/.nvm/.../npm, etc.
  const cmd = getBasename(unwrapped[0]);
  const subcmd = unwrapped[1] || '';

  // P1-002: npm ecosystem - npm, npx, pnpm, yarn, bun
  if (['npm', 'pnpm'].includes(cmd) && ['install', 'i', 'add'].includes(subcmd)) {
    return { ecosystem: 'npm', packageArgs: unwrapped.slice(2) };
  }

  // SECURITY FIX: npm link installs packages globally
  if (cmd === 'npm' && subcmd === 'link') {
    const linkArgs = unwrapped.slice(2);
    // npm link (no args) = link current directory, npm link <pkg> = install <pkg>
    if (linkArgs.length > 0) {
      return { ecosystem: 'npm', packageArgs: linkArgs };
    }
  }

  if (cmd === 'yarn' && ['add', 'install'].includes(subcmd)) {
    return { ecosystem: 'npm', packageArgs: unwrapped.slice(2) };
  }

  // yarn link
  if (cmd === 'yarn' && subcmd === 'link') {
    const linkArgs = unwrapped.slice(2);
    if (linkArgs.length > 0) {
      return { ecosystem: 'npm', packageArgs: linkArgs };
    }
  }

  if (cmd === 'bun' && ['add', 'install', 'i'].includes(subcmd)) {
    return { ecosystem: 'npm', packageArgs: unwrapped.slice(2) };
  }

  // bun link
  if (cmd === 'bun' && subcmd === 'link') {
    const linkArgs = unwrapped.slice(2);
    if (linkArgs.length > 0) {
      return { ecosystem: 'npm', packageArgs: linkArgs };
    }
  }

  // P1-003: npx/bunx execution - npx <package> runs arbitrary code
  // SECURITY FIX: Also capture packages from -p/--package flags
  if ((cmd === 'npx' || cmd === 'bunx') && unwrapped.length >= 2) {
    const packagesToCheck: string[] = [];
    let i = 1;

    while (i < unwrapped.length) {
      const arg = unwrapped[i];

      if (arg === '-p' || arg === '--package') {
        // -p <package> or --package <package>
        if (i + 1 < unwrapped.length && !unwrapped[i + 1].startsWith('-')) {
          const pkg = unwrapped[i + 1];
          if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
            packagesToCheck.push(pkg);
          }
        }
        i += 2;
      } else if (arg.startsWith('--package=')) {
        // --package=<package>
        const pkg = arg.substring('--package='.length);
        if (pkg && !pkg.startsWith('.') && !pkg.startsWith('/')) {
          packagesToCheck.push(pkg);
        }
        i++;
      } else if (arg.startsWith('-')) {
        // Skip other flags
        i++;
      } else {
        // First non-flag argument is the executable package
        if (!arg.startsWith('.') && !arg.startsWith('/')) {
          packagesToCheck.push(arg);
        }
        break; // Stop after finding executable
      }
    }

    if (packagesToCheck.length > 0) {
      return { ecosystem: 'npm', packageArgs: packagesToCheck };
    }
  }

  // npm exec <package>
  if (cmd === 'npm' && subcmd === 'exec') {
    return { ecosystem: 'npm', packageArgs: unwrapped.slice(2) };
  }

  // P1-002: pip ecosystem - pip, pip3, pipx, uv, poetry
  if (['pip', 'pip3', 'pipx'].includes(cmd) && subcmd === 'install') {
    return { ecosystem: 'pypi', packageArgs: unwrapped.slice(2) };
  }

  // uv pip install
  if (cmd === 'uv' && subcmd === 'pip' && unwrapped[2] === 'install') {
    return { ecosystem: 'pypi', packageArgs: unwrapped.slice(3) };
  }

  // poetry add
  if (cmd === 'poetry' && subcmd === 'add') {
    return { ecosystem: 'pypi', packageArgs: unwrapped.slice(2) };
  }

  // python -m pip install (also handle full paths like /usr/bin/python3)
  const pythonBasename = getBasename(unwrapped[0]);
  if ((pythonBasename === 'python' || pythonBasename === 'python3') && subcmd === '-m') {
    if (unwrapped[2] === 'pip' && unwrapped[3] === 'install') {
      return { ecosystem: 'pypi', packageArgs: unwrapped.slice(4) };
    }
  }

  // homebrew - install, reinstall, upgrade
  if (cmd === 'brew' && ['install', 'reinstall', 'upgrade'].includes(subcmd)) {
    return { ecosystem: 'homebrew', packageArgs: unwrapped.slice(2) };
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
