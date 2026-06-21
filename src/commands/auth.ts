import { saveKiipuConfig } from '../config/config.js';
import {
  createAuthState,
  createLoopbackServer,
  createPkcePair,
  getDefaultDeviceName,
  openBrowser,
  waitForEnterBeforeOpeningBrowser,
} from '../lib/browser-auth.js';
import { KiipuUserApiClient } from '../lib/kiipu-user-client.js';
import { logCliEvent } from '../logger/cli-logger.js';
import type { CliCommandResult, KiipuCliConfig } from '../types/index.js';

async function storeAuthenticatedConfig(
  config: KiipuCliConfig,
  payload: {
    apiKey: string;
    keyPrefix: string | null;
    userId: string;
    username: string;
  },
) {
  config.apiKey = payload.apiKey;
  config.keyPrefix = payload.keyPrefix ?? undefined;
  config.authUserId = payload.userId;
  config.authUsername = payload.username;
  await saveKiipuConfig(config);
}

async function loginWithApiKey(config: KiipuCliConfig, apiKey: string): Promise<CliCommandResult> {
  const client = new KiipuUserApiClient({
    apiBaseUrl: config.apiBaseUrl,
    apiKey,
  });
  const response = await client.getApiKeyMe();

  if (!response.ok) {
    return {
      ok: false,
      message: response.error.message,
    };
  }

  await storeAuthenticatedConfig(config, {
    apiKey,
    keyPrefix: response.data.keyPrefix,
    userId: response.data.userId,
    username: response.data.username,
  });

  return {
    ok: true,
    message: `Authenticated as ${response.data.username} (${response.data.displayName}). Key ${response.data.keyPrefix ?? 'unknown'} is now stored locally.`,
    data: response.data,
  };
}

async function loginWithBrowser(
  config: KiipuCliConfig,
  input: {
    deviceName?: string;
    noBrowser?: boolean;
  },
): Promise<CliCommandResult> {
  const deviceName = input.deviceName?.trim() || getDefaultDeviceName();
  const state = createAuthState();
  const { verifier, challenge } = createPkcePair();
  const server = await createLoopbackServer(state);
  const client = new KiipuUserApiClient({
    apiBaseUrl: config.apiBaseUrl,
  });

  try {
    const session = await client.createCliAuthSession({
      deviceName,
      redirectUri: server.redirectUri,
      state,
      codeChallenge: challenge,
    });

    if (!session.ok) {
      return {
        ok: false,
        message: session.error.message,
      };
    }

    console.log(`Kiipu CLI will connect this device as "${deviceName}".`);
    console.log(`Waiting for browser login at ${session.data.authorizeUrl}`);

    if (input.noBrowser) {
      console.log('Open the URL above in your browser to continue.');
    } else {
      await waitForEnterBeforeOpeningBrowser();
      const opened = openBrowser(session.data.authorizeUrl);

      if (!opened) {
        console.log('Could not open the browser automatically. Open this URL manually:');
        console.log(session.data.authorizeUrl);
      }
    }

    const callback = await server.waitForCallback(
      new Date(session.data.expiresAt).getTime() - Date.now(),
    );
    const exchange = await client.exchangeCliAuthSession({
      sessionId: session.data.sessionId,
      authorizationCode: callback.code,
      codeVerifier: verifier,
    });

    if (!exchange.ok) {
      return {
        ok: false,
        message: exchange.error.message,
      };
    }

    await storeAuthenticatedConfig(config, {
      apiKey: exchange.data.apiKey,
      keyPrefix: exchange.data.keyPrefix,
      userId: exchange.data.userId,
      username: exchange.data.username,
    });

    logCliEvent('auth_browser_login_complete', {
      username: exchange.data.username,
      deviceName,
    });

    return {
      ok: true,
      message: `Authenticated as ${exchange.data.username} (${exchange.data.displayName}). This device is now connected to Kiipu and stored locally.`,
      data: exchange.data,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Kiipu browser login failed.',
    };
  } finally {
    await server.close().catch(() => undefined);
  }
}

export async function runAuthCommand(
  config: KiipuCliConfig,
  input: {
    action: 'login' | 'status' | 'logout';
    apiKey?: string;
    deviceName?: string;
    noBrowser?: boolean;
  },
): Promise<CliCommandResult> {
  if (input.action === 'logout') {
    delete config.apiKey;
    delete config.keyPrefix;
    delete config.authUserId;
    delete config.authUsername;
    await saveKiipuConfig(config);
    return {
      ok: true,
      message:
        'Kiipu authentication was cleared from the local config. Connected devices stay revocable from the web settings page.',
    };
  }

  if (input.action === 'status') {
    if (!config.apiKey) {
      return {
        ok: true,
        message: 'Kiipu CLI is not authenticated yet. Run `kiipu auth login` first.',
      };
    }

    const client = new KiipuUserApiClient({
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
    });
    const response = await client.getApiKeyMe();

    if (!response.ok) {
      return {
        ok: false,
        message: response.error.message,
      };
    }

    await storeAuthenticatedConfig(config, {
      apiKey: config.apiKey,
      keyPrefix: response.data.keyPrefix,
      userId: response.data.userId,
      username: response.data.username,
    });

    return {
      ok: true,
      message: `Authenticated as ${response.data.username} (${response.data.displayName}) with key ${response.data.keyPrefix ?? 'unknown'}.`,
      data: response.data,
    };
  }

  if (input.apiKey) {
    return loginWithApiKey(config, input.apiKey);
  }

  return loginWithBrowser(config, {
    deviceName: input.deviceName,
    noBrowser: input.noBrowser,
  });
}
