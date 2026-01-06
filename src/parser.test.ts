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
});
