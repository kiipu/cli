import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { CLI_VERSION } from '../src/version.js';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const tsxBinPath = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));

test('CLI version export matches package.json', () => {
  assert.match(CLI_VERSION, /^\d+\.\d+\.\d+/);
});

test('kiipu -v prints the current CLI version', async () => {
  const { stdout, stderr } = await execFileAsync(tsxBinPath, ['src/index.ts', '-v'], {
    cwd: packageRoot,
  });

  assert.equal(stderr, '');
  assert.equal(stdout.trim(), CLI_VERSION);
});

test('kiipu --version prints the current CLI version', async () => {
  const { stdout, stderr } = await execFileAsync(tsxBinPath, ['src/index.ts', '--version'], {
    cwd: packageRoot,
  });

  assert.equal(stderr, '');
  assert.equal(stdout.trim(), CLI_VERSION);
});
