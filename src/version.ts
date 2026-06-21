import { readFileSync } from 'node:fs';

const packageJsonPath = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };

export const CLI_VERSION = packageJson.version ?? '0.0.0';
