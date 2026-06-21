import assert from 'node:assert/strict';
import test from 'node:test';

import { runAskCommand } from '../src/commands/ask.js';
import type { KiipuCliConfig } from '../src/types/index.js';

function createConfig(overrides: Partial<KiipuCliConfig> = {}) {
  return {
    apiBaseUrl: 'http://localhost:3001',
    apiKey: 'cpk_secret_value',
    ...overrides,
  } satisfies KiipuCliConfig;
}

function createJsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createSseResponse(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  const frames = events
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(frames));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );
}

test('ask streams a new conversation and returns json-ready answer data', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return createSseResponse([
      { type: 'meta', conversationId: 'conv-1', isNew: true, title: null },
      {
        type: 'sources',
        locked: false,
        sources: [
          {
            index: 1,
            noteId: 'note-1',
            title: 'Roadmap',
            snippet: 'Roadmap source snippet',
            score: 0.91,
          },
        ],
      },
      { type: 'delta', text: 'Hello ' },
      { type: 'delta', text: 'Kiipu' },
      { type: 'done', turnId: 'turn-1', inputTokens: 12, outputTokens: 4, latencyMs: 321 },
      { type: 'title', conversationId: 'conv-1', title: 'Roadmap Q&A' },
    ]);
  }) as typeof fetch;

  const chunks: string[] = [];
  const result = await runAskCommand(createConfig(), ['ask', 'What', 'about', 'roadmap?'], {
    stream: true,
    write: (chunk) => chunks.push(chunk),
  });

  assert.equal(result.ok, true);
  assert.equal(chunks.join(''), 'Hello Kiipu');
  assert.match(result.message, /Sources:/);
  assert.match(result.message, /Conversation: conv-1/);
  assert.match(result.message, /Title: Roadmap Q&A/);
  assert.equal(requests[0]?.url, 'http://localhost:3001/ai/conversations/new/messages');
  assert.deepEqual(requests[0]?.body, { question: 'What about roadmap?' });

  const json = result.json as Record<string, unknown>;
  assert.equal(json.ok, true);
  assert.equal(json.answer, 'Hello Kiipu');
  assert.equal(json.conversationId, 'conv-1');
  assert.equal(json.title, 'Roadmap Q&A');
  assert.equal(json.turnId, 'turn-1');
});

test('ask continues an existing conversation with top-k and source mode', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return createSseResponse([
      { type: 'meta', conversationId: 'conv-2', isNew: false, title: 'Existing' },
      { type: 'sources', locked: true, sources: [] },
      { type: 'delta', text: 'Follow-up answer' },
      { type: 'done', turnId: 'turn-2', inputTokens: 8, outputTokens: 3, latencyMs: 42 },
    ]);
  }) as typeof fetch;

  const result = await runAskCommand(createConfig(), [
    'ask',
    '--conversation-id',
    'conv-2',
    '--top-k',
    '3',
    '--source-mode',
    'locked',
    'Follow',
    'up',
  ]);

  assert.equal(result.ok, true);
  assert.match(result.message, /Follow-up answer/);
  assert.equal(requests[0]?.url, 'http://localhost:3001/ai/conversations/conv-2/messages');
  assert.deepEqual(requests[0]?.body, {
    question: 'Follow up',
    topK: 3,
    sourceMode: 'locked',
  });
});

test('ask returns partial data when the stream emits an error', async () => {
  global.fetch = (async () =>
    createSseResponse([
      { type: 'meta', conversationId: 'conv-3', isNew: true, title: null },
      { type: 'delta', text: 'Partial' },
      { type: 'error', code: 'ai_disabled', message: 'AI is disabled.' },
    ])) as typeof fetch;

  const result = await runAskCommand(createConfig(), ['ask', '--question', 'Hello']);

  assert.equal(result.ok, false);
  assert.equal(result.message, 'AI is disabled.');
  const json = result.json as Record<string, unknown>;
  assert.equal(json.ok, false);
  assert.equal(json.message, 'AI is disabled.');
  assert.equal(json.code, 'ai_disabled');
  assert.equal(json.answer, 'Partial');
  assert.equal(json.conversationId, 'conv-3');
});

test('ask reports HTTP errors and missing authentication', async () => {
  global.fetch = (async () =>
    createJsonResponse(503, { code: 'ai_disabled', message: 'AI is disabled.' })) as typeof fetch;

  const httpError = await runAskCommand(createConfig(), ['ask', 'Hello']);
  assert.equal(httpError.ok, false);
  assert.equal(httpError.message, 'AI is disabled.');
  assert.equal((httpError.json as Record<string, unknown>).code, 'ai_disabled');

  delete process.env.KIIPU_API_KEY;
  const missingAuth = await runAskCommand({ apiBaseUrl: 'http://localhost:3001' }, [
    'ask',
    'Hello',
  ]);
  assert.equal(missingAuth.ok, false);
  assert.match(missingAuth.message, /kiipu auth login/);
});

test('ask history lists conversations with filters', async () => {
  const requests: string[] = [];
  global.fetch = (async (input) => {
    requests.push(String(input));
    return createJsonResponse(200, {
      success: true,
      data: {
        items: [
          {
            id: 'conv-4',
            title: 'Roadmap Q&A',
            preview: 'What about roadmap?',
            lastMessageAt: '2026-04-02T10:00:00.000Z',
            createdAt: '2026-04-01T10:00:00.000Z',
            pinnedAt: null,
            archivedAt: null,
          },
        ],
        nextCursor: null,
      },
    });
  }) as typeof fetch;

  const result = await runAskCommand(createConfig(), [
    'ask',
    'history',
    '--query',
    'roadmap',
    '--limit',
    '1',
  ]);

  assert.equal(result.ok, true);
  assert.match(result.message, /Ask conversations/);
  assert.match(result.message, /conv-4/);
  assert.equal(requests[0], 'http://localhost:3001/ai/conversations?q=roadmap&limit=1');
});

test('ask show renders conversation turns and sources', async () => {
  global.fetch = (async () =>
    createJsonResponse(200, {
      success: true,
      data: {
        id: 'conv-5',
        title: 'Saved notes',
        sources: [],
        lastMessageAt: '2026-04-02T10:00:00.000Z',
        createdAt: '2026-04-01T10:00:00.000Z',
        turns: [
          {
            id: 'user-turn',
            role: 'user',
            content: 'What did I save?',
            status: 'done',
            errorCode: null,
            createdAt: '2026-04-01T10:00:00.000Z',
          },
          {
            id: 'assistant-turn',
            role: 'assistant',
            content: 'You saved a roadmap note.',
            status: 'done',
            errorCode: null,
            createdAt: '2026-04-01T10:00:01.000Z',
            sources: [
              {
                index: 1,
                noteId: 'note-1',
                title: 'Roadmap',
                snippet: 'Roadmap source snippet',
                score: 0.91,
              },
            ],
          },
        ],
      },
    })) as typeof fetch;

  const result = await runAskCommand(createConfig(), ['ask', 'show', '--id', 'conv-5']);

  assert.equal(result.ok, true);
  assert.match(result.message, /Saved notes/);
  assert.match(result.message, /User user-turn/);
  assert.match(result.message, /Assistant assistant-turn/);
  assert.match(result.message, /Roadmap \(note-1\)/);
});
