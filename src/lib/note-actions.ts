import { randomUUID } from 'node:crypto';

import type { CliCommandResult } from '../types/index.js';
import { KiipuIntegrationApiClient } from './kiipu-integration-client.js';

export type NoteCommandAction = 'create' | 'delete' | 'restore' | 'purge';

export type NoteActionInput =
  | {
      action: 'create';
      content: string;
      title?: string;
      traceIdPrefix?: string;
      sourceMessageId?: string;
    }
  | {
      action: 'delete' | 'restore' | 'purge';
      noteId: string;
      traceIdPrefix?: string;
    };

export type NoteActionResult = CliCommandResult & {
  requestId?: string;
  noteId?: string | null;
};

type NoteActionConfig = {
  apiBaseUrl: string;
  apiKey?: string;
};

function formatRequestFailed(message: string, code: string) {
  return `Request failed: ${message} (${code}).`;
}

function getNoteApiClient(config: NoteActionConfig) {
  const apiKey = config.apiKey ?? process.env.KIIPU_API_KEY ?? '';
  if (!apiKey) {
    return {
      error: {
        ok: false,
        message: 'Kiipu API key is missing. Run `kiipu auth login` first.',
      } satisfies CliCommandResult,
    };
  }

  return {
    client: new KiipuIntegrationApiClient({
      apiBaseUrl: config.apiBaseUrl,
      apiKey,
    }),
  };
}

export async function executeNoteAction(
  config: NoteActionConfig,
  input: NoteActionInput,
): Promise<NoteActionResult> {
  const { client, error } = getNoteApiClient(config);
  if (!client) {
    return error;
  }

  if (input.action === 'create') {
    const response = await client.createNote({
      requestId: randomUUID(),
      requestedAt: new Date().toISOString(),
      traceId: `${input.traceIdPrefix ?? 'note'}-${Date.now()}`,
      rawText: input.content,
      ...(input.title ? { title: input.title } : {}),
      sourceType: 'skill_command',
      sourceMessageId: input.sourceMessageId ?? `local-${Date.now()}`,
      visibility: 'public',
    });

    if (!response.ok) {
      return {
        ok: false,
        message: formatRequestFailed(response.error.message, response.error.code),
      };
    }

    return {
      ok: true,
      message: `Note created. Note id ${String(response.data.id)} is now visible in the feed.`,
      data: response.data,
      requestId: response.requestId,
      noteId: String(response.data.id),
    };
  }

  if (input.action === 'delete') {
    const response = await client.deleteNote({
      requestId: randomUUID(),
      requestedAt: new Date().toISOString(),
      traceId: `${input.traceIdPrefix ?? 'delete'}-${Date.now()}`,
      noteId: input.noteId,
    });

    if (!response.ok) {
      return {
        ok: false,
        message: formatRequestFailed(response.error.message, response.error.code),
      };
    }

    return {
      ok: true,
      message: 'Note deleted. The current note is no longer visible in the feed.',
      data: response.data,
      requestId: response.requestId,
      noteId: null,
    };
  }

  if (input.action === 'restore') {
    const response = await client.restoreNote({
      requestId: randomUUID(),
      requestedAt: new Date().toISOString(),
      traceId: `${input.traceIdPrefix ?? 'restore'}-${Date.now()}`,
      noteId: input.noteId,
    });

    if (!response.ok) {
      return {
        ok: false,
        message: formatRequestFailed(response.error.message, response.error.code),
      };
    }

    return {
      ok: true,
      message: `Note restored. Note id ${input.noteId} is now back in the feed.`,
      data: response.data,
      requestId: response.requestId,
      noteId: input.noteId,
    };
  }

  const response = await client.permanentDeleteNote({
    requestId: randomUUID(),
    requestedAt: new Date().toISOString(),
    traceId: `${input.traceIdPrefix ?? 'purge'}-${Date.now()}`,
    noteId: input.noteId,
  });

  if (!response.ok) {
    return {
      ok: false,
      message: formatRequestFailed(response.error.message, response.error.code),
    };
  }

  return {
    ok: true,
    message: `Note permanently deleted. Note id ${input.noteId} has been removed from the database.`,
    data: response.data,
    requestId: response.requestId,
    noteId: null,
  };
}
