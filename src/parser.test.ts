import { describe, it, expect } from 'vitest';
import { parseInstallCommand } from './parser.js';

describe('parseInstallCommand', () => {
  describe('basic commands', () => {
    it('parses npm install', () => {
      expect(parseInstallCommand('npm install lodash')).toEqual([
        { name: 'lodash', ecosystem: 'npm' }
      ]);
    });

    it('parses npm i (shorthand)', () => {
      expect(parseInstallCommand('npm i express')).toEqual([
        { name: 'express', ecosystem: 'npm' }
      ]);
    });

    it('parses pip install', () => {
      expect(parseInstallCommand('pip install requests')).toEqual([
        { name: 'requests', ecosystem: 'pypi' }
      ]);
    });

    it('parses pip3 install', () => {
      expect(parseInstallCommand('pip3 install django')).toEqual([
        { name: 'django', ecosystem: 'pypi' }
      ]);
    });

    it('parses brew install', () => {
      expect(parseInstallCommand('brew install wget')).toEqual([
        { name: 'wget', ecosystem: 'homebrew' }
      ]);
    });
  });

  describe('versioned packages', () => {
    it('parses npm package@version', () => {
      expect(parseInstallCommand('npm install lodash@4.17.21')).toEqual([
        { name: 'lodash', version: '4.17.21', ecosystem: 'npm' }
      ]);
    });

    it('parses pip package==version', () => {
      expect(parseInstallCommand('pip install requests==2.28.0')).toEqual([
        { name: 'requests', version: '2.28.0', ecosystem: 'pypi' }
      ]);
    });

    it('parses scoped npm packages', () => {
      expect(parseInstallCommand('npm install @types/node@20.0.0')).toEqual([
        { name: '@types/node', version: '20.0.0', ecosystem: 'npm' }
      ]);
    });

    it('parses scoped npm packages without version', () => {
      expect(parseInstallCommand('npm install @types/node')).toEqual([
        { name: '@types/node', ecosystem: 'npm' }
      ]);
    });
  });

  describe('command chaining bypass prevention', () => {
    it('catches npm install after cd', () => {
      expect(parseInstallCommand('cd /tmp && npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches pip install after semicolon', () => {
      expect(parseInstallCommand('true; pip install evil')).toEqual([
        { name: 'evil', ecosystem: 'pypi' }
      ]);
    });

    it('catches install after OR operator', () => {
      expect(parseInstallCommand('false || npm install backdoor')).toEqual([
        { name: 'backdoor', ecosystem: 'npm' }
      ]);
    });

    it('catches install in pipe chain', () => {
      expect(parseInstallCommand('echo test | npm install compromised')).toEqual([
        { name: 'compromised', ecosystem: 'npm' }
      ]);
    });
  });

  describe('environment variable prefixes', () => {
    it('handles NODE_ENV prefix', () => {
      expect(parseInstallCommand('NODE_ENV=production npm install pkg')).toEqual([
        { name: 'pkg', ecosystem: 'npm' }
      ]);
    });

    it('handles multiple env vars', () => {
      expect(parseInstallCommand('CI=true DEBUG=1 npm install lib')).toEqual([
        { name: 'lib', ecosystem: 'npm' }
      ]);
    });
  });

  describe('nested shell commands', () => {
    it('catches bash -c nested install', () => {
      expect(parseInstallCommand('bash -c "npm install hidden"')).toEqual([
        { name: 'hidden', ecosystem: 'npm' }
      ]);
    });

    it('catches sh -c nested install', () => {
      expect(parseInstallCommand('sh -c "pip install sneaky"')).toEqual([
        { name: 'sneaky', ecosystem: 'pypi' }
      ]);
    });

    it('catches /usr/bin/bash -c nested install', () => {
      expect(parseInstallCommand('/usr/bin/bash -c "npm install hidden"')).toEqual([
        { name: 'hidden', ecosystem: 'npm' }
      ]);
    });

    it('catches ksh -c nested install', () => {
      expect(parseInstallCommand('ksh -c "npm install hidden"')).toEqual([
        { name: 'hidden', ecosystem: 'npm' }
      ]);
    });

    it('catches dash -c nested install', () => {
      expect(parseInstallCommand('dash -c "pip install sneaky"')).toEqual([
        { name: 'sneaky', ecosystem: 'pypi' }
      ]);
    });
  });

  describe('multiple packages', () => {
    it('parses multiple npm packages', () => {
      expect(parseInstallCommand('npm install lodash express axios')).toEqual([
        { name: 'lodash', ecosystem: 'npm' },
        { name: 'express', ecosystem: 'npm' },
        { name: 'axios', ecosystem: 'npm' }
      ]);
    });

    it('parses multiple installs in chain', () => {
      expect(parseInstallCommand('npm install pkg1 && pip install pkg2')).toEqual([
        { name: 'pkg1', ecosystem: 'npm' },
        { name: 'pkg2', ecosystem: 'pypi' }
      ]);
    });
  });

  describe('non-install commands', () => {
    it('returns null for non-install commands', () => {
      expect(parseInstallCommand('npm test')).toBeNull();
      expect(parseInstallCommand('git clone repo')).toBeNull();
      expect(parseInstallCommand('ls -la')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(parseInstallCommand('')).toBeNull();
    });

    it('returns null for npm install with no packages', () => {
      expect(parseInstallCommand('npm install')).toBeNull();
    });
  });

  describe('flags are ignored', () => {
    it('ignores -D flag', () => {
      expect(parseInstallCommand('npm install -D typescript')).toEqual([
        { name: 'typescript', ecosystem: 'npm' }
      ]);
    });

    it('ignores --save-dev flag', () => {
      expect(parseInstallCommand('npm install --save-dev jest')).toEqual([
        { name: 'jest', ecosystem: 'npm' }
      ]);
    });
  });

  // P1-001: Command wrapper bypass prevention
  describe('command wrapper bypass prevention', () => {
    it('catches env npm install', () => {
      expect(parseInstallCommand('env npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches sudo npm install', () => {
      expect(parseInstallCommand('sudo npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches sudo -u root npm install', () => {
      expect(parseInstallCommand('sudo -u root npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches exec npm install', () => {
      expect(parseInstallCommand('exec npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches command npm install', () => {
      expect(parseInstallCommand('command npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches nohup npm install', () => {
      expect(parseInstallCommand('nohup npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches timeout 60 npm install', () => {
      expect(parseInstallCommand('timeout 60 npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches /usr/bin/env npm install', () => {
      expect(parseInstallCommand('/usr/bin/env npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches nested wrappers: sudo env npm install', () => {
      expect(parseInstallCommand('sudo env npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches nice npm install', () => {
      expect(parseInstallCommand('nice npm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });
  });

  // P1-002: Alternative package managers
  describe('alternative package managers', () => {
    describe('pnpm', () => {
      it('parses pnpm install', () => {
        expect(parseInstallCommand('pnpm install lodash')).toEqual([
          { name: 'lodash', ecosystem: 'npm' }
        ]);
      });

      it('parses pnpm add', () => {
        expect(parseInstallCommand('pnpm add express')).toEqual([
          { name: 'express', ecosystem: 'npm' }
        ]);
      });

      it('parses pnpm i', () => {
        expect(parseInstallCommand('pnpm i axios')).toEqual([
          { name: 'axios', ecosystem: 'npm' }
        ]);
      });
    });

    describe('yarn', () => {
      it('parses yarn add', () => {
        expect(parseInstallCommand('yarn add lodash')).toEqual([
          { name: 'lodash', ecosystem: 'npm' }
        ]);
      });

      it('parses yarn install with package', () => {
        expect(parseInstallCommand('yarn install express')).toEqual([
          { name: 'express', ecosystem: 'npm' }
        ]);
      });
    });

    describe('bun', () => {
      it('parses bun add', () => {
        expect(parseInstallCommand('bun add lodash')).toEqual([
          { name: 'lodash', ecosystem: 'npm' }
        ]);
      });

      it('parses bun install', () => {
        expect(parseInstallCommand('bun install express')).toEqual([
          { name: 'express', ecosystem: 'npm' }
        ]);
      });

      it('parses bun i', () => {
        expect(parseInstallCommand('bun i axios')).toEqual([
          { name: 'axios', ecosystem: 'npm' }
        ]);
      });
    });

    describe('pipx', () => {
      it('parses pipx install', () => {
        expect(parseInstallCommand('pipx install black')).toEqual([
          { name: 'black', ecosystem: 'pypi' }
        ]);
      });
    });

    describe('poetry', () => {
      it('parses poetry add', () => {
        expect(parseInstallCommand('poetry add requests')).toEqual([
          { name: 'requests', ecosystem: 'pypi' }
        ]);
      });
    });

    describe('uv pip', () => {
      it('parses uv pip install', () => {
        expect(parseInstallCommand('uv pip install django')).toEqual([
          { name: 'django', ecosystem: 'pypi' }
        ]);
      });
    });

    describe('python -m pip', () => {
      it('parses python -m pip install', () => {
        expect(parseInstallCommand('python -m pip install flask')).toEqual([
          { name: 'flask', ecosystem: 'pypi' }
        ]);
      });

      it('parses python3 -m pip install', () => {
        expect(parseInstallCommand('python3 -m pip install django')).toEqual([
          { name: 'django', ecosystem: 'pypi' }
        ]);
      });
    });

    describe('brew subcommands', () => {
      it('parses brew reinstall', () => {
        expect(parseInstallCommand('brew reinstall wget')).toEqual([
          { name: 'wget', ecosystem: 'homebrew' }
        ]);
      });

      it('parses brew upgrade', () => {
        expect(parseInstallCommand('brew upgrade git')).toEqual([
          { name: 'git', ecosystem: 'homebrew' }
        ]);
      });
    });
  });

  // P1-003: npx/bunx execution bypass prevention
  describe('npx execution bypass prevention', () => {
    it('catches npx package execution', () => {
      expect(parseInstallCommand('npx malicious-package')).toEqual([
        { name: 'malicious-package', ecosystem: 'npm' }
      ]);
    });

    it('catches npx --yes package execution', () => {
      expect(parseInstallCommand('npx --yes malicious-package')).toEqual([
        { name: 'malicious-package', ecosystem: 'npm' }
      ]);
    });

    it('catches npx -y package execution', () => {
      expect(parseInstallCommand('npx -y evil-pkg')).toEqual([
        { name: 'evil-pkg', ecosystem: 'npm' }
      ]);
    });

    it('catches bunx package execution', () => {
      expect(parseInstallCommand('bunx malicious-package')).toEqual([
        { name: 'malicious-package', ecosystem: 'npm' }
      ]);
    });

    it('catches npm exec package', () => {
      expect(parseInstallCommand('npm exec malicious-package')).toEqual([
        { name: 'malicious-package', ecosystem: 'npm' }
      ]);
    });

    it('ignores npx with local script', () => {
      expect(parseInstallCommand('npx ./local-script.js')).toBeNull();
    });

    it('ignores npx with absolute path', () => {
      expect(parseInstallCommand('npx /usr/local/bin/script')).toBeNull();
    });
  });

  // Combined P1 tests - complex scenarios
  describe('combined bypass scenarios', () => {
    it('catches env + alternative package manager', () => {
      expect(parseInstallCommand('env yarn add malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches sudo + pnpm', () => {
      expect(parseInstallCommand('sudo pnpm install malicious')).toEqual([
        { name: 'malicious', ecosystem: 'npm' }
      ]);
    });

    it('catches bash -c + npx', () => {
      expect(parseInstallCommand('bash -c "npx evil-package"')).toEqual([
        { name: 'evil-package', ecosystem: 'npm' }
      ]);
    });

    it('catches chained alternative package managers', () => {
      expect(parseInstallCommand('yarn add pkg1 && pnpm add pkg2')).toEqual([
        { name: 'pkg1', ecosystem: 'npm' },
        { name: 'pkg2', ecosystem: 'npm' }
      ]);
    });

    it('catches env + poetry', () => {
      expect(parseInstallCommand('env poetry add malicious')).toEqual([
        { name: 'malicious', ecosystem: 'pypi' }
      ]);
    });

    it('catches timeout + npx', () => {
      expect(parseInstallCommand('timeout 60 npx evil-pkg')).toEqual([
        { name: 'evil-pkg', ecosystem: 'npm' }
      ]);
    });
  });

  // pip extras
  describe('pip extras', () => {
    it('handles pip install with extras', () => {
      expect(parseInstallCommand('pip install requests[security]')).toEqual([
        { name: 'requests', ecosystem: 'pypi' }
      ]);
    });

    it('handles pip install with extras and version', () => {
      expect(parseInstallCommand('pip install requests[security]==2.28.0')).toEqual([
        { name: 'requests', version: '2.28.0', ecosystem: 'pypi' }
      ]);
    });
  });
});
