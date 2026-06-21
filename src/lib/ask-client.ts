import { TextDecoder } from 'node:util';

export type AskSource = {
  index: number;
  noteId: string;
  title: string | null;
  snippet: string;
  score: number;
  createdAt?: string;
};

export type AskUsage = {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export type AskEvent =
  | { type: 'meta'; conversationId: string; isNew: boolean; title: string | null }
  | {
      type: 'sources';
      sources: AskSource[];
      locked: boolean;
      retrievalMode?: 'semantic' | 'temporal_list';
      totalCount?: number;
      truncated?: boolean;
    }
  | { type: 'delta'; text: string }
  | ({ type: 'done'; turnId: string } & AskUsage)
  | { type: 'title'; conversationId: string; title: string }
  | { type: 'error'; code: string; message: string };

export type AskConversationSummary = {
  id: string;
  title: string | null;
  preview: string;
  lastMessageAt: string;
  createdAt: string;
  pinnedAt: string | null;
  archivedAt: string | null;
};

export type AskConversationTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AskSource[];
  status: 'streaming' | 'done' | 'error' | 'cancelled';
  errorCode: string | null;
  createdAt: string;
};

export type AskConversationDetail = {
  id: string;
  title: string | null;
  sources: AskSource[];
  turns: AskConversationTurn[];
  lastMessageAt: string;
  createdAt: string;
};

type AskClientConfig = {
  apiBaseUrl: string;
  apiKey: string;
};

type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiResponse<T> = ApiSuccess<T> | ApiError;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function buildError(message: string, code = 'request_failed'): ApiError {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  if (isRecord(payload.message) && typeof payload.message.message === 'string') {
    return payload.message.message;
  }

  if (isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }

  return fallback;
}

function getErrorCode(payload: unknown, fallback = 'request_failed') {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.code === 'string') {
    return payload.code;
  }

  if (isRecord(payload.message) && typeof payload.message.code === 'string') {
    return payload.message.code;
  }

  if (isRecord(payload.error) && typeof payload.error.code === 'string') {
    return payload.error.code;
  }

  return fallback;
}

function parseSource(input: unknown): AskSource | null {
  if (!isRecord(input)) {
    return null;
  }

  const noteId = typeof input.noteId === 'string' ? input.noteId : '';
  const snippet = typeof input.snippet === 'string' ? input.snippet : '';
  if (!noteId || !snippet) {
    return null;
  }

  return {
    index: typeof input.index === 'number' ? input.index : 0,
    noteId,
    title: typeof input.title === 'string' ? input.title : null,
    snippet,
    score: typeof input.score === 'number' ? input.score : 0,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : undefined,
  };
}

function parseSources(input: unknown) {
  return Array.isArray(input)
    ? input.map(parseSource).filter((source): source is AskSource => Boolean(source))
    : [];
}

function parseAskEvent(input: unknown): AskEvent | null {
  if (!isRecord(input) || typeof input.type !== 'string') {
    return null;
  }

  switch (input.type) {
    case 'meta':
      if (typeof input.conversationId !== 'string') {
        return null;
      }
      return {
        type: 'meta',
        conversationId: input.conversationId,
        isNew: Boolean(input.isNew),
        title: typeof input.title === 'string' ? input.title : null,
      };
    case 'sources':
      return {
        type: 'sources',
        sources: parseSources(input.sources),
        locked: Boolean(input.locked),
        retrievalMode:
          input.retrievalMode === 'semantic' || input.retrievalMode === 'temporal_list'
            ? input.retrievalMode
            : undefined,
        totalCount: typeof input.totalCount === 'number' ? input.totalCount : undefined,
        truncated: typeof input.truncated === 'boolean' ? input.truncated : undefined,
      };
    case 'delta':
      return typeof input.text === 'string' ? { type: 'delta', text: input.text } : null;
    case 'done':
      if (typeof input.turnId !== 'string') {
        return null;
      }
      return {
        type: 'done',
        turnId: input.turnId,
        inputTokens: typeof input.inputTokens === 'number' ? input.inputTokens : 0,
        outputTokens: typeof input.outputTokens === 'number' ? input.outputTokens : 0,
        latencyMs: typeof input.latencyMs === 'number' ? input.latencyMs : 0,
      };
    case 'title':
      if (typeof input.conversationId !== 'string' || typeof input.title !== 'string') {
        return null;
      }
      return { type: 'title', conversationId: input.conversationId, title: input.title };
    case 'error':
      return {
        type: 'error',
        code: typeof input.code === 'string' ? input.code : 'unknown',
        message: typeof input.message === 'string' ? input.message : 'Unknown Ask error.',
      };
    default:
      return null;
  }
}

function extractDataField(frame: string) {
  const dataLines = [];

  for (const line of frame.split('\n')) {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (normalized.startsWith('data:')) {
      dataLines.push(normalized.slice(5).replace(/^ /, ''));
    }
  }

  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class KiipuAskClient {
  constructor(private readonly config: AskClientConfig) {}

  private async requestJson<T>(path: string, init: RequestInit): Promise<ApiResponse<T>> {
    let response: Response;

    try {
      response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      return buildError(
        `Kiipu API is unreachable at ${this.config.apiBaseUrl}.`,
        'api_unreachable',
      );
    }

    const payload = await readJson(response);
    if (!response.ok) {
      return buildError(
        getErrorMessage(payload, `Request failed with ${response.status}.`),
        getErrorCode(payload, `http_${response.status}`),
      );
    }

    const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
    return {
      ok: true,
      data: data as T,
    };
  }

  listConversations(input: { query?: string; limit?: number; archived?: boolean }) {
    const search = new URLSearchParams();
    if (input.query) {
      search.set('q', input.query);
    }
    if (input.limit) {
      search.set('limit', String(input.limit));
    }
    if (input.archived) {
      search.set('view', 'archived');
    }

    const query = search.toString();
    return this.requestJson<{ items: AskConversationSummary[]; nextCursor: string | null }>(
      `/ai/conversations${query ? `?${query}` : ''}`,
      { method: 'GET' },
    );
  }

  getConversation(id: string) {
    return this.requestJson<AskConversationDetail>(`/ai/conversations/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  }

  async *streamMessage(input: {
    conversationId: string | 'new';
    question: string;
    topK?: number;
    sourceMode?: 'fresh' | 'locked';
  }): AsyncIterable<AskEvent> {
    const body = {
      question: input.question,
      ...(input.topK ? { topK: input.topK } : {}),
      ...(input.sourceMode ? { sourceMode: input.sourceMode } : {}),
    };
    let response: Response;

    try {
      response = await fetch(
        `${this.config.apiBaseUrl}/ai/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(body),
        },
      );
    } catch (error) {
      yield {
        type: 'error',
        code: 'network_error',
        message: error instanceof Error ? error.message : 'Network request failed.',
      };
      return;
    }

    if (!response.ok || !response.body) {
      const payload = await readJson(response);
      yield {
        type: 'error',
        code: getErrorCode(payload, `http_${response.status}`),
        message: getErrorMessage(payload, `Request failed with ${response.status}.`),
      };
      return;
    }

    let settled = false;
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let separator = buffer.indexOf('\n\n');
        while (separator !== -1) {
          const frame = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const data = extractDataField(frame);
          if (data && data !== '[DONE]') {
            try {
              const event = parseAskEvent(JSON.parse(data));
              if (event) {
                if (event.type === 'done' || event.type === 'error') {
                  settled = true;
                }
                yield event;
              }
            } catch {
              // Ignore malformed SSE frames from intermediaries.
            }
          }
          separator = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (!settled) {
        yield {
          type: 'error',
          code: 'stream_error',
          message: error instanceof Error ? error.message : 'Stream interrupted.',
        };
      }
      return;
    } finally {
      reader.releaseLock();
    }

    if (!settled) {
      yield {
        type: 'error',
        code: 'stream_truncated',
        message: 'The response ended unexpectedly. Please try again.',
      };
    }
  }
}
