import { KiipuUserApiClient } from '../lib/kiipu-user-client.js';
import { access } from 'node:fs/promises';

import { getConfiguredApiBaseUrl, getDefaultConfigPath } from '../config/config.js';
import { logCliEvent } from '../logger/cli-logger.js';
import type { CliCommandResult, KiipuCliConfig } from '../types/index.js';

export async function runDoctorCommand(config: KiipuCliConfig | null): Promise<CliCommandResult> {
  logCliEvent('doctor_start');
  const configPath = getDefaultConfigPath();

  if (!config) {
    return {
      ok: false,
      message: `Missing config at ${configPath}. Run \`kiipu auth login\` first.`,
    };
  }

  const checks: string[] = [];
  let ok = true;
  const apiBaseUrlConfig = getConfiguredApiBaseUrl();

  checks.push(
    config.apiKey
      ? `OK API key: ${config.keyPrefix ?? 'configured'}`
      : 'Missing API key. Run `kiipu auth login`.',
  );
  if (!(config.apiKey || process.env.KIIPU_API_KEY)) {
    ok = false;
  }
  checks.push(
    config.apiKey || process.env.KIIPU_API_KEY
      ? 'OK note API auth: configured'
      : 'Missing API key for note requests.',
  );
  checks.push(
    apiBaseUrlConfig.source === 'env'
      ? `WARN API base URL override: ${config.apiBaseUrl}`
      : `OK API base URL: ${config.apiBaseUrl}`,
  );

  let apiStatus = `API unreachable at ${config.apiBaseUrl}`;
  try {
    const response = await fetch(`${config.apiBaseUrl}/health`);
    apiStatus = response.ok ? 'API reachable' : `API returned ${response.status}`;
  } catch {
    apiStatus = `API unreachable at ${config.apiBaseUrl}`;
  }
  if (apiStatus !== 'API reachable') {
    ok = false;
  }
  checks.push(apiStatus);

  if (config.apiKey) {
    const authStatus = await new KiipuUserApiClient({
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
    }).getApiKeyMe();
    if (!authStatus.ok) {
      ok = false;
    }
    checks.push(
      authStatus.ok
        ? `OK API key auth: ${authStatus.data.username}`
        : `API key auth failed: ${authStatus.error.message}`,
    );
  }

  try {
    await access(configPath);
    checks.push(`OK config: ${configPath}`);
  } catch {
    ok = false;
    checks.push(`Missing config file: ${configPath}`);
  }

  logCliEvent('doctor_complete', {
    ok,
  });

  return {
    ok,
    message: checks.join('\n'),
  };
}
