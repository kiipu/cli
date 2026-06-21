#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const releaseRoot = path.resolve(repoRoot, '.release', 'cli-package');
const packDestination = path.resolve(packageRoot, '..', '..', 'dist-packages');
const npmCache = path.resolve(packageRoot, '..', '..', '.npm-pack-cache');

mkdirSync(packDestination, { recursive: true });

execFileSync('node', [path.resolve(repoRoot, 'infra', 'scripts', 'prepare-cli-release.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
});

execFileSync('npm', ['pack', '--cache', npmCache, '--pack-destination', packDestination], {
  cwd: releaseRoot,
  stdio: 'inherit',
});
