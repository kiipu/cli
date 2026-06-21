import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';

import { logCliEvent } from '../logger/cli-logger.js';

function toBase64Url(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createRandomToken(size = 32) {
  return toBase64Url(randomBytes(size));
}

export function createPkcePair() {
  const verifier = createRandomToken(48);
  const challenge = toBase64Url(createHash('sha256').update(verifier).digest());

  return {
    verifier,
    challenge,
  };
}

export function createAuthState() {
  return createRandomToken(24);
}

export function getDefaultDeviceName() {
  return os.hostname();
}

export async function createLoopbackServer(expectedState: string) {
  return new Promise<{
    redirectUri: string;
    waitForCallback: (timeoutMs: number) => Promise<{ code: string; state: string }>;
    close: () => Promise<void>;
  }>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = null;
    let callbackResolver: ((value: { code: string; state: string }) => void) | null = null;
    let callbackRejecter: ((error: Error) => void) | null = null;
    let pendingValue: { code: string; state: string } | null = null;
    let pendingError: Error | null = null;

    function renderPage(input: { title: string; body: string; tone?: 'success' | 'error' }) {
      const tone = input.tone ?? 'success';
      const accent = tone === 'success' ? '#d56c47' : '#c2410c';
      const accentSoft =
        tone === 'success' ? 'rgba(213, 108, 71, 0.16)' : 'rgba(194, 65, 12, 0.14)';
      const badgeText = tone === 'success' ? 'CLI Connected' : 'Connection Error';

      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f1ec;
        --card: rgba(255, 255, 255, 0.88);
        --text: #201714;
        --muted: rgba(32, 23, 20, 0.64);
        --border: rgba(32, 23, 20, 0.08);
        --accent: ${accent};
        --accent-soft: ${accentSoft};
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(213, 108, 71, 0.18), transparent 30%),
          linear-gradient(135deg, #fcf8f5 0%, #f5ece5 100%);
        color: var(--text);
      }

      .shell {
        width: min(100%, 560px);
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--card);
        backdrop-filter: blur(14px);
        box-shadow:
          0 20px 60px rgba(61, 33, 20, 0.10),
          inset 0 1px 0 rgba(255, 255, 255, 0.55);
        overflow: hidden;
      }

      .hero {
        padding: 28px 28px 18px;
        background:
          radial-gradient(circle at top left, var(--accent-soft), transparent 42%),
          linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0.4));
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.55);
      }

      .content {
        padding: 8px 28px 28px;
      }

      h1 {
        margin: 18px 0 10px;
        font-size: clamp(28px, 5vw, 38px);
        line-height: 1.04;
        letter-spacing: -0.04em;
      }

      p {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.7;
      }

      .panel {
        margin-top: 22px;
        display: grid;
        gap: 12px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.72);
        padding: 16px 18px;
      }

      .panel strong {
        display: block;
        font-size: 14px;
        color: var(--text);
        margin-bottom: 4px;
      }

      .footer {
        margin-top: 16px;
        font-size: 13px;
        color: rgba(32, 23, 20, 0.48);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="badge"><span class="dot"></span>${badgeText}</div>
        <h1>${input.title}</h1>
      </section>
      <section class="content">
        <p>${input.body}</p>
        <div class="panel">
          <div>
            <strong>What happens next</strong>
            Return to your terminal and Kiipu will finish connecting this device automatically.
          </div>
        </div>
        <p class="footer">This tab is only used to complete the local Kiipu CLI sign-in flow.</p>
      </section>
    </main>
  </body>
</html>`;
    }

    function respond(response: ServerResponse, status: number, body: string) {
      response.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end(body);
    }

    function done(error?: Error, value?: { code: string; state: string }) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      if (error) {
        if (callbackRejecter) {
          callbackRejecter(error);
        } else {
          pendingError = error;
        }
      } else if (value) {
        if (callbackResolver) {
          callbackResolver(value);
        } else {
          pendingValue = value;
        }
      }
    }

    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (url.pathname !== '/callback') {
        respond(response, 404, '<h1>Not found</h1>');
        return;
      }

      const code = url.searchParams.get('code')?.trim() ?? '';
      const state = url.searchParams.get('state')?.trim() ?? '';

      if (!code || !state) {
        respond(
          response,
          400,
          renderPage({
            title: 'Missing login parameters',
            body: 'Kiipu could not complete this local sign-in because the callback was missing required details. Close this tab and run `kiipu auth login` again.',
            tone: 'error',
          }),
        );
        return;
      }

      if (state !== expectedState) {
        respond(
          response,
          400,
          renderPage({
            title: 'This login link is no longer valid',
            body: 'The browser callback did not match the active Kiipu CLI session. Start a fresh `kiipu auth login` command and try again.',
            tone: 'error',
          }),
        );
        done(new Error('CLI login callback state did not match the expected request.'));
        return;
      }

      respond(
        response,
        200,
        renderPage({
          title: 'Kiipu CLI connected',
          body: 'This browser step is complete. You can close this tab and return to your terminal.',
          tone: 'success',
        }),
      );
      done(undefined, { code, state });
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine the local CLI callback port.'));
        return;
      }

      resolve({
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        waitForCallback(timeoutMs: number) {
          return new Promise<{ code: string; state: string }>((innerResolve, innerReject) => {
            if (pendingError) {
              const error = pendingError;
              pendingError = null;
              innerReject(error);
              return;
            }

            if (pendingValue) {
              const value = pendingValue;
              pendingValue = null;
              innerResolve(value);
              return;
            }

            callbackResolver = innerResolve;
            callbackRejecter = innerReject;
            timeout = setTimeout(() => {
              innerReject(new Error('Timed out waiting for browser login to complete.'));
            }, timeoutMs);
          });
        },
        close() {
          return new Promise<void>((innerResolve, innerReject) => {
            server.close((error) => {
              if (error) {
                innerReject(error);
                return;
              }
              innerResolve();
            });
          });
        },
      });
    });
  });
}

export async function waitForEnterBeforeOpeningBrowser() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    await rl.question('Press Enter to open the browser and continue login...');
  } finally {
    rl.close();
  }
}

export function openBrowser(url: string) {
  const platform = process.platform;
  const command =
    platform === 'darwin'
      ? { file: 'open', args: [url] }
      : platform === 'win32'
        ? { file: 'cmd', args: ['/c', 'start', '', url] }
        : { file: 'xdg-open', args: [url] };

  try {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    logCliEvent('auth_browser_opened', {
      platform,
    });
    return true;
  } catch {
    return false;
  }
}
