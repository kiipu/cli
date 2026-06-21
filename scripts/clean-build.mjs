#!/usr/bin/env node

import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

rmSync(path.join(packageRoot, 'dist'), { recursive: true, force: true });
rmSync(path.join(packageRoot, 'skill-assets'), { recursive: true, force: true });
