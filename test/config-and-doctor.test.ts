import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runDoctorCommand } from '../src/commands/doctor.js';
import {
  DEFAULT_KIIPU_API_BASE_URL,
  createDefaultConfig,
  getDefaultConfigPath,
  loadKiipuConfig,
} from '../src/config/config.js';

function createJsonResponse(ok: boolean, payload: unknown) {
  return {
    ok,
    async json() {
      return payload;
    },
  } as Response;
}

test('default config uses the production API base url', () => {
  delete process.env.KIIPU_API_URL;

  const config = createDefaultConfig();

  assert.equal(config.apiBaseUrl, DEFAULT_KIIPU_API_BASE_URL);
});

test('stored config persists the last authenticated API base url', async () => {
  delete process.env.KIIPU_API_URL;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kiipu-cli-config-'));
  process.env.KIIPU_CONFIG_HOME = path.join(tempDir, '.config', 'kiipu');

  const configPath = getDefaultConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: 'http://localhost:3001',
      apiKey: 'cpk_secret_value',
      authUsername: 'owner',
    }),
    'utf8',
  );

  const config = await loadKiipuConfig();

  assert.ok(config);
  assert.equal(config?.apiBaseUrl, 'http://localhost:3001');
  assert.equal(config?.apiKey, 'cpk_secret_value');
  assert.equal(config?.authUsername, 'owner');
});

test('environment API base url override still wins over stored config', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kiipu-cli-config-'));
  process.env.KIIPU_CONFIG_HOME = path.join(tempDir, '.config', 'kiipu');
  process.env.KIIPU_API_URL = 'http://127.0.0.1:8787';

  const configPath = getDefaultConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      apiBaseUrl: 'http://localhost:3001',
      apiKey: 'cpk_secret_value',
    }),
    'utf8',
  );

  const config = await loadKiipuConfig();

  assert.ok(config);
  assert.equal(config?.apiBaseUrl, 'http://127.0.0.1:8787');

  delete process.env.KIIPU_API_URL;
});

test('doctor reports failure when the API is unreachable', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kiipu-cli-doctor-'));
  process.env.KIIPU_CONFIG_HOME = path.join(tempDir, '.config', 'kiipu');

  const configPath = getDefaultConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ apiKey: 'cpk_secret_value' }), 'utf8');

  global.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;

  const result = await runDoctorCommand({
    apiBaseUrl: DEFAULT_KIIPU_API_BASE_URL,
    apiKey: 'cpk_secret_value',
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /API unreachable at https:\/\/api\.kiipu\.com/);
});

test('doctor reports success when the API and auth checks pass', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kiipu-cli-doctor-'));
  process.env.KIIPU_CONFIG_HOME = path.join(tempDir, '.config', 'kiipu');

  const configPath = getDefaultConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ apiKey: 'cpk_secret_value' }), 'utf8');

  const responses = [
    createJsonResponse(true, {}),
    createJsonResponse(true, {
      data: {
        userId: 'user-1',
        username: 'owner',
        displayName: 'Owner',
        keyPrefix: 'cpk_abcdef123456',
      },
    }),
  ];
  global.fetch = (async () =>
    responses.shift() ??
    createJsonResponse(false, { message: 'Unexpected request' })) as typeof fetch;

  const result = await runDoctorCommand({
    apiBaseUrl: DEFAULT_KIIPU_API_BASE_URL,
    apiKey: 'cpk_secret_value',
  });

  assert.equal(result.ok, true);
  assert.match(result.message, /OK API base URL: https:\/\/api\.kiipu\.com/);
  assert.match(result.message, /OK API key auth: owner/);
});
