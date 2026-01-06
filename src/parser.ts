
export interface ParsedPackage {
  name: string;
  version?: string;
  ecosystem: 'npm' | 'pypi' | 'homebrew';
}

export function parseInstallCommand(command: string): ParsedPackage[] | null {
  const trimmedCommand = command.trim();

  const npmRegex = /^(npm|npx)\s+(install|i|add)\s+/;
  const pipRegex = /^pip(3)?\s+install\s+/;
  const brewRegex = /^brew\s+install\s+/;

  let ecosystem: ParsedPackage['ecosystem'] | null = null;
  let commandless: string = '';

  if (npmRegex.test(trimmedCommand)) {
    ecosystem = 'npm';
    commandless = trimmedCommand.replace(npmRegex, '');
  } else if (pipRegex.test(trimmedCommand)) {
    ecosystem = 'pypi';
    commandless = trimmedCommand.replace(pipRegex, '');
  } else if (brewRegex.test(trimmedCommand)) {
    ecosystem = 'homebrew';
    commandless = trimmedCommand.replace(brewRegex, '');
  } else {
    return null;
  }

  const parts = commandless.split(/\s+/).filter(p => p && !p.startsWith('-'));

  if (parts.length === 0) {
    return null;
  }

  const packages: ParsedPackage[] = [];

  for (const part of parts) {
    if (ecosystem === 'npm' || ecosystem === 'homebrew') {
      const lastAt = part.lastIndexOf('@');
      if (lastAt > 0) {
        const name = part.substring(0, lastAt);
        const version = part.substring(lastAt + 1);
        if (name) {
            packages.push({ name, version, ecosystem });
        }
      } else {
        packages.push({ name: part, ecosystem });
      }
    } else if (ecosystem === 'pypi') {
      const sep = '==';
      const index = part.indexOf(sep);
      if (index > 0) {
        packages.push({
          name: part.substring(0, index),
          version: part.substring(index + sep.length),
          ecosystem,
        });
      } else {
        packages.push({ name: part, ecosystem });
      }
    }
  }

  return packages.length > 0 ? packages : null;
}
