import { existsSync, readFileSync } from 'node:fs';

function parseEnvFile(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  const filePath = `${process.cwd()}/.env`;

  if (!existsSync(filePath)) {
    return;
  }

  parseEnvFile(readFileSync(filePath, 'utf8'));
}

loadLocalEnv();
