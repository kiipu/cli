import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { get } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runAuthCommand } from '../src/commands/auth.js';
import type { KiipuCliConfig } from '../src/types/index.js';

function createJsonResponse(ok: boolean, payload: unknown) {
  return {
    ok,
    async json() {
      return payload;
    },
  } as Response;
}

async function createConfig() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kiipu-cli-auth-'));
  process.env.KIIPU_CONFIG_HOME = path.join(tempDir, '.config', 'kiipu');

  return {
    apiBaseUrl: 'http://localhost:3001',
  } satisfies KiipuCliConfig;
}

test('auth login stores the api key and current user info', async () => {
  const config = await createConfig();
  global.fetch = (async () =>
    createJsonResponse(true, {
      success: true,
      data: {
        userId: 'user-1',
        username: 'owner',
        displayName: 'Owner',
        keyPrefix: 'cpk_abcdef123456',
      },
    })) as typeof fetch;

  const result = await runAuthCommand(config, {
    action: 'login',
    apiKey: 'cpk_secret_value',
  });

  assert.equal(result.ok, true);
  assert.equal(config.apiKey, 'cpk_secret_value');
  assert.equal(config.authUsername, 'owner');
  assert.equal(config.keyPrefix, 'cpk_abcdef123456');
});

test('browser auth login exchanges a CLI-managed key and writes local config', async () => {
  const config = await createConfig();

  global.fetch = (async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith('/auth/cli/sessions')) {
      const body = JSON.parse(String(init?.body)) as {
        redirectUri: string;
        state: string;
      };

      setTimeout(() => {
        const callbackUrl = new URL(body.redirectUri);
        callbackUrl.searchParams.set('code', 'cli_auth_code');
        callbackUrl.searchParams.set('state', body.state);
        get(callbackUrl, (response) => {
          response.resume();
        });
      }, 50);

      return createJsonResponse(true, {
        success: true,
        data: {
          sessionId: 'session-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          authorizeUrl: 'https://kiipu.com/login?next=%2Fcli%2Fauth%3FsessionId%3Dsession-1',
        },
      });
    }

    if (url.endsWith('/auth/cli/exchange')) {
      return createJsonResponse(true, {
        success: true,
        data: {
          apiKey: 'cpk_browser_secret',
          keyPrefix: 'cpk_browser_pref',
          userId: 'user-1',
          username: 'owner',
          displayName: 'Owner',
        },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const result = await runAuthCommand(config, {
    action: 'login',
    noBrowser: true,
    deviceName: 'Test Mac',
  });

  assert.equal(result.ok, true);
  assert.equal(config.apiKey, 'cpk_browser_secret');
  assert.equal(config.authUsername, 'owner');

  const saved = JSON.parse(
    await readFile(path.join(process.env.KIIPU_CONFIG_HOME!, 'config.json'), 'utf8'),
  ) as {
    apiKey: string;
    authUsername: string;
  };

  assert.equal(saved.apiKey, 'cpk_browser_secret');
  assert.equal(saved.authUsername, 'owner');
});
