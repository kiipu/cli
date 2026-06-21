import { randomUUID } from 'node:crypto';

type ClientConfig = {
  apiBaseUrl: string;
  apiKey: string;
};

type SkillErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

type SkillSuccessResponse = {
  ok: true;
  requestId: string;
  data: Record<string, unknown>;
};

type ApiResponse = SkillSuccessResponse | SkillErrorResponse;

type CreateNoteFromSkillRequest = {
  requestId: string;
  requestedAt?: string;
  traceId?: string;
  rawText: string;
  sourceType?: 'skill_command' | 'manual' | 'imported';
  finalText?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  sourceMessageId?: string;
  title?: string | null;
  tags?: string[];
};

type NoteMutationRequest = {
  requestId: string;
  requestedAt?: string;
  traceId?: string;
  noteId: string;
};

function buildError(
  requestId: string,
  message: string,
  code = 'request_failed',
): SkillErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      requestId,
    },
  };
}

function parseCreateNoteRequest(input: Record<string, unknown>): CreateNoteFromSkillRequest {
  const requestId = typeof input.requestId === 'string' ? input.requestId : randomUUID();
  const rawText = typeof input.rawText === 'string' ? input.rawText.trim() : '';
  if (!rawText) {
    throw new Error('rawText is required.');
  }

  const visibility = input.visibility;
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  return {
    requestId,
    requestedAt: typeof input.requestedAt === 'string' ? input.requestedAt : undefined,
    traceId: typeof input.traceId === 'string' ? input.traceId : undefined,
    rawText,
    sourceType:
      input.sourceType === 'manual' ||
      input.sourceType === 'imported' ||
      input.sourceType === 'skill_command'
        ? input.sourceType
        : 'skill_command',
    finalText: typeof input.finalText === 'string' ? input.finalText : undefined,
    visibility:
      visibility === 'unlisted' || visibility === 'private' || visibility === 'public'
        ? visibility
        : 'public',
    sourceMessageId: typeof input.sourceMessageId === 'string' ? input.sourceMessageId : undefined,
    title: typeof input.title === 'string' ? input.title : input.title === null ? null : undefined,
    tags,
  };
}

function parseNoteMutationRequest(input: Record<string, unknown>): NoteMutationRequest {
  const requestId = typeof input.requestId === 'string' ? input.requestId : randomUUID();
  const noteId = typeof input.noteId === 'string' ? input.noteId.trim() : '';
  if (!noteId) {
    throw new Error('noteId is required.');
  }

  return {
    requestId,
    requestedAt: typeof input.requestedAt === 'string' ? input.requestedAt : undefined,
    traceId: typeof input.traceId === 'string' ? input.traceId : undefined,
    noteId,
  };
}

export class KiipuIntegrationApiClient {
  constructor(private readonly config: ClientConfig) {}

  private async request(
    path: string,
    method: 'POST',
    body: { requestId: string } & Record<string, unknown>,
  ): Promise<ApiResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      return buildError(
        body.requestId,
        `Kiipu API is unreachable at ${this.config.apiBaseUrl}.`,
        'api_unreachable',
      );
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      requestId?: string;
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string; requestId?: string };
      message?: string | { message?: string; code?: string };
      code?: string;
    };

    if (response.ok) {
      return {
        ok: true,
        requestId: typeof payload.requestId === 'string' ? payload.requestId : body.requestId,
        data: payload.data ?? {},
      };
    }

    return buildError(
      body.requestId,
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.message === 'object' && typeof payload.message?.message === 'string'
          ? payload.message.message
          : typeof payload.error?.message === 'string'
            ? payload.error.message
            : 'CLI request failed.',
      typeof payload.message === 'object' && typeof payload.message?.code === 'string'
        ? payload.message.code
        : typeof payload.error?.code === 'string'
          ? payload.error.code
          : typeof payload.code === 'string'
            ? payload.code
            : 'request_failed',
    );
  }

  createNote(input: Record<string, unknown>) {
    return this.request('/integrations/notes', 'POST', parseCreateNoteRequest(input));
  }

  deleteNote(input: Record<string, unknown>) {
    const body = parseNoteMutationRequest(input);
    return this.request(`/integrations/notes/${body.noteId}/delete`, 'POST', body);
  }

  restoreNote(input: Record<string, unknown>) {
    const body = parseNoteMutationRequest(input);
    return this.request(`/integrations/notes/${body.noteId}/restore`, 'POST', body);
  }

  permanentDeleteNote(input: Record<string, unknown>) {
    const body = parseNoteMutationRequest(input);
    return this.request(`/integrations/notes/${body.noteId}/permanent-delete`, 'POST', body);
  }
}
