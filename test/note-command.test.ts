import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { runNoteCommand } from '../src/commands/note.js';
import type { KiipuCliConfig } from '../src/types/index.js';

function createJsonResponse(ok: boolean, payload: unknown) {
  return {
    ok,
    async json() {
      return payload;
    },
  } as Response;
}

function createNote(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    title: 'Hello Kiipu',
    rawText: 'Hello Kiipu body',
    finalText: 'Hello Kiipu body',
    visibility: 'public',
    tags: [{ id: 'tag-1', tagName: 'kiipu' }],
    folder: null,
    isPinned: false,
    isStarred: false,
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    ...overrides,
  };
}

async function createConfig() {
  return {
    apiBaseUrl: 'http://localhost:3001',
    apiKey: 'cpk_secret_value',
  } satisfies KiipuCliConfig;
}

test('note create creates a note with explicit content', async () => {
  const config = await createConfig();
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return createJsonResponse(true, {
      ok: true,
      requestId: randomUUID(),
      data: {
        id: 'note-1',
      },
    });
  }) as typeof fetch;

  const result = await runNoteCommand(config, [
    'note',
    'create',
    '--content',
    'Ship the direct CLI',
  ]);

  assert.equal(result.ok, true);
  assert.match(result.message, /Note created/);
  assert.equal(requests[0]?.url, 'http://localhost:3001/integrations/notes');
  assert.equal(requests[0]?.body.rawText, 'Ship the direct CLI');
  assert.equal(Object.hasOwn(requests[0]?.body ?? {}, 'title'), false);
});

test('note create forwards an explicit title without changing frontmatter content', async () => {
  const config = await createConfig();
  const requests: Array<Record<string, unknown>> = [];
  global.fetch = (async (_input, init) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return createJsonResponse(true, {
      ok: true,
      requestId: randomUUID(),
      data: { id: 'note-2' },
    });
  }) as typeof fetch;

  const content = '---\nsource: "https://example.com"\n---\n\nBody copy';
  const result = await runNoteCommand(config, [
    'note',
    'create',
    '--content',
    content,
    '--title',
    'Explicit title',
  ]);

  assert.equal(result.ok, true);
  assert.equal(requests[0]?.rawText, content);
  assert.equal(requests[0]?.title, 'Explicit title');
});

test('note create requires content', async () => {
  const config = await createConfig();

  const result = await runNoteCommand(config, ['note', 'create']);

  assert.equal(result.ok, false);
  assert.match(result.message, /kiipu note create/);
});

test('note list rejects mutually exclusive starred and deleted flags', async () => {
  const config = await createConfig();

  const result = await runNoteCommand(config, ['note', 'list', '--starred', '--deleted']);

  assert.equal(result.ok, false);
  assert.match(result.message, /cannot be used together/);
});

test('note list validates sort and formats human-readable output', async () => {
  const config = await createConfig();
  global.fetch = (async () =>
    createJsonResponse(true, {
      success: true,
      data: [
        createNote('note-1', {
          isPinned: true,
          isStarred: true,
          tags: [{ tagName: 'one' }, { tagName: 'two' }, { tagName: 'three' }, { tagName: 'four' }],
        }),
      ],
    })) as typeof fetch;

  const result = await runNoteCommand(config, ['note', 'list', '--sort', 'updatedAt']);

  assert.equal(result.ok, true);
  assert.match(result.message, /Notes/);
  assert.match(result.message, /note-1/);
  assert.match(result.message, /pinned, starred/);
  assert.match(result.message, /#one, #two, #three/);
  assert.deepEqual(result.data, [
    createNote('note-1', {
      isPinned: true,
      isStarred: true,
      tags: [{ tagName: 'one' }, { tagName: 'two' }, { tagName: 'three' }, { tagName: 'four' }],
    }),
  ]);
});

test('note list rejects unsupported sort values', async () => {
  const config = await createConfig();

  const result = await runNoteCommand(config, ['note', 'list', '--sort', 'status']);

  assert.equal(result.ok, false);
  assert.match(result.message, /Invalid --sort value/);
});

test('note search supports positional query and json-ready data payload', async () => {
  const config = await createConfig();
  global.fetch = (async () =>
    createJsonResponse(true, {
      success: true,
      data: [createNote('note-2', { title: 'Roadmap' })],
    })) as typeof fetch;

  const result = await runNoteCommand(config, ['note', 'search', 'roadmap']);

  assert.equal(result.ok, true);
  assert.match(result.message, /Search results for "roadmap"/);
  assert.deepEqual(result.data, [createNote('note-2', { title: 'Roadmap' })]);
});

test('note show requires an explicit note id and renders full content', async () => {
  const config = await createConfig();

  const missingId = await runNoteCommand(config, ['note', 'show']);
  assert.equal(missingId.ok, false);
  assert.equal(missingId.message, 'Usage: kiipu note show --id <noteId>');

  global.fetch = (async () =>
    createJsonResponse(true, {
      success: true,
      data: createNote('note-3', {
        title: 'Weekly note',
        finalText: 'Long body goes here',
        folder: { id: 'folder-1', name: 'Inbox' },
        isPinned: true,
        isStarred: true,
      }),
    })) as typeof fetch;

  const result = await runNoteCommand(config, ['note', 'show', '--id', 'note-3']);

  assert.equal(result.ok, true);
  assert.match(result.message, /Weekly note/);
  assert.match(result.message, /Long body goes here/);
  assert.match(result.message, /folder: Inbox \(folder-1\)/);
  assert.match(result.message, /pinned: yes/);
  assert.match(result.message, /starred: yes/);
});

test('note update validates visibility and rejects manual tags', async () => {
  const config = await createConfig();
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });

    return createJsonResponse(true, {
      success: true,
      data: createNote('note-4', {
        title: 'Updated',
        finalText: 'Updated text',
        visibility: 'private',
        tags: [
          { tagName: 'Work' },
          { tagName: 'Notes' },
          { tagName: 'Roadmap' },
          { tagName: 'One' },
          { tagName: 'Two' },
          { tagName: 'Three' },
          { tagName: 'Four' },
          { tagName: 'Five' },
        ],
      }),
    });
  }) as typeof fetch;

  const invalidVisibility = await runNoteCommand(config, [
    'note',
    'update',
    '--id',
    'note-4',
    '--content',
    'Updated',
    '--visibility',
    'team',
  ]);
  assert.equal(invalidVisibility.ok, false);
  assert.match(invalidVisibility.message, /Invalid --visibility value/);

  const result = await runNoteCommand(config, [
    'note',
    'update',
    '--id',
    'note-4',
    '--content',
    'Updated text',
    '--title',
    'Updated',
    '--visibility',
    'private',
  ]);

  assert.equal(result.ok, true);
  assert.match(result.message, /Note updated/);
  assert.equal(requests[0]?.url, 'http://localhost:3001/notes/note-4/content');
  assert.deepEqual(requests[0]?.body, {
    rawText: 'Updated text',
    title: 'Updated',
  });
  assert.equal(requests[1]?.url, 'http://localhost:3001/notes/note-4/metadata');
  assert.deepEqual(requests[1]?.body, {
    visibility: 'private',
  });

  const rejectedTags = await runNoteCommand(config, [
    'note',
    'update',
    '--id',
    'note-4',
    '--tags',
    'work,notes',
  ]);
  assert.equal(rejectedTags.ok, false);
  assert.match(rejectedTags.message, /Tags are now derived from note content/);
});

test('note star and pin toggle state by explicit id', async () => {
  const config = await createConfig();
  const responses = [
    createJsonResponse(true, {
      success: true,
      data: createNote('note-5', { isStarred: true }),
    }),
    createJsonResponse(true, {
      success: true,
      data: createNote('note-5', { isPinned: true }),
    }),
  ];

  global.fetch = (async () =>
    responses.shift() ??
    createJsonResponse(false, { message: 'Unexpected request' })) as typeof fetch;

  const starResult = await runNoteCommand(config, ['note', 'star', '--id', 'note-5']);
  const pinResult = await runNoteCommand(config, ['note', 'pin', '--id', 'note-5']);

  assert.equal(starResult.ok, true);
  assert.equal(starResult.message, 'Note starred. note-5');
  assert.equal(pinResult.ok, true);
  assert.equal(pinResult.message, 'Note pinned. note-5');
});

test('note delete restore and purge use explicit ids', async () => {
  const config = await createConfig();
  const responses = [
    createJsonResponse(true, {
      ok: true,
      requestId: randomUUID(),
      data: {
        id: 'note-2',
      },
    }),
    createJsonResponse(true, {
      ok: true,
      requestId: randomUUID(),
      data: {
        id: 'note-2',
      },
    }),
  ];

  global.fetch = (async () =>
    responses.shift() ??
    createJsonResponse(false, { message: 'Unexpected request' })) as typeof fetch;

  const deleteMissingId = await runNoteCommand(config, ['note', 'delete']);
  assert.equal(deleteMissingId.ok, false);
  assert.equal(deleteMissingId.message, 'Usage: kiipu note delete --id <noteId>');

  const restoreResult = await runNoteCommand(config, ['note', 'restore', '--id', 'note-2']);
  const purgeResult = await runNoteCommand(config, ['note', 'purge', '--id', 'note-2']);

  assert.equal(restoreResult.ok, true);
  assert.match(restoreResult.message, /Note restored/);
  assert.equal(purgeResult.ok, true);
  assert.match(purgeResult.message, /permanently deleted/);
});
