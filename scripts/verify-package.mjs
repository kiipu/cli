#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const releaseRoot = path.resolve(repoRoot, '.release', 'cli-package');

execFileSync('node', [path.resolve(repoRoot, 'infra', 'scripts', 'prepare-cli-release.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const requiredPaths = [
  path.join(releaseRoot, 'dist', 'index.js'),
  path.join(releaseRoot, 'README.md'),
  path.join(releaseRoot, 'package.json'),
];

const missing = requiredPaths.filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error('Kiipu package verification failed. Missing files:');
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const distFiles = readdirSync(path.join(releaseRoot, 'dist'));
console.log('Kiipu package verification succeeded.');
console.log(`dist files: ${distFiles.join(', ')}`);
