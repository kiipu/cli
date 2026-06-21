import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { KiipuCliConfig } from '../types/index.js';

export const DEFAULT_KIIPU_API_BASE_URL = 'https://api.kiipu.com';

export function getKiipuConfigHome() {
  if (process.env.KIIPU_CONFIG_HOME) {
    return process.env.KIIPU_CONFIG_HOME;
  }

  return path.join(os.homedir(), '.config', 'kiipu');
}

export function getDefaultConfigPath() {
  return path.join(getKiipuConfigHome(), 'config.json');
}

export function getConfiguredApiBaseUrl() {
  const envValue = process.env.KIIPU_API_URL?.trim();
  if (envValue) {
    return {
      value: envValue,
      source: 'env' as const,
    };
  }

  return {
    value: DEFAULT_KIIPU_API_BASE_URL,
    source: 'default' as const,
  };
}

function getFileConfiguredApiBaseUrl(raw: Record<string, unknown>) {
  const value = typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl.trim() : '';

  if (!value) {
    return null;
  }

  return {
    value,
    source: 'file' as const,
  };
}

export function createDefaultConfig(): KiipuCliConfig {
  return {
    apiBaseUrl: getConfiguredApiBaseUrl().value,
  };
}

export async function loadKiipuConfig(
  configPath = getDefaultConfigPath(),
): Promise<KiipuCliConfig | null> {
  if (!existsSync(configPath)) {
    return null;
  }

  const content = await readFile(configPath, 'utf8');
  const raw = JSON.parse(content) as Record<string, unknown>;
  const nextConfig: KiipuCliConfig = createDefaultConfig();
  const envConfiguredApiBaseUrl = process.env.KIIPU_API_URL?.trim();
  const fileConfiguredApiBaseUrl = getFileConfiguredApiBaseUrl(raw);

  if (!envConfiguredApiBaseUrl && fileConfiguredApiBaseUrl) {
    nextConfig.apiBaseUrl = fileConfiguredApiBaseUrl.value;
  }

  if (typeof raw.apiKey === 'string') {
    nextConfig.apiKey = raw.apiKey;
  }

  if (typeof raw.keyPrefix === 'string') {
    nextConfig.keyPrefix = raw.keyPrefix;
  }

  if (typeof raw.authUserId === 'string') {
    nextConfig.authUserId = raw.authUserId;
  }

  if (typeof raw.authUsername === 'string') {
    nextConfig.authUsername = raw.authUsername;
  }

  return nextConfig;
}

export async function saveKiipuConfig(config: KiipuCliConfig, configPath = getDefaultConfigPath()) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}
