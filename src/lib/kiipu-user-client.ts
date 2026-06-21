type UserApiConfig = {
  apiBaseUrl: string;
  apiKey?: string;
};

export type UserNoteTag = {
  id?: string;
  tagName: string;
};

export type UserNoteFolder = {
  id: string;
  name: string;
} | null;

export type UserNote = {
  id: string;
  title: string | null;
  rawText: string;
  finalText: string;
  visibility: 'public' | 'private';
  tags: UserNoteTag[];
  folder?: UserNoteFolder;
  isPinned: boolean;
  isStarred?: boolean;
  createdAt: string;
  updatedAt: string;
};

type UserApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type UserApiSuccess<T> = {
  ok: true;
  data: T;
};

type UserApiResponse<T> = UserApiSuccess<T> | UserApiError;

function buildError(message: string, code = 'request_failed'): UserApiError {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export class KiipuUserApiClient {
  constructor(private readonly config: UserApiConfig) {}

  private buildPath(path: string, params?: Record<string, string | undefined>) {
    if (!params) {
      return path;
    }

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.length > 0) {
        search.set(key, value);
      }
    }

    const query = search.toString();
    return query ? `${path}?${query}` : path;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<UserApiResponse<T>> {
    let response: Response;

    try {
      response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      return buildError(
        `Kiipu API is unreachable at ${this.config.apiBaseUrl}.`,
        'api_unreachable',
      );
    }

    const payload = (await response.json()) as {
      success?: boolean;
      data?: T;
      message?: string | { message?: string; code?: string };
      code?: string;
    };

    if (response.ok) {
      return {
        ok: true,
        data: (payload.data ?? payload) as T,
      };
    }

    return buildError(
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.message?.message === 'string'
          ? payload.message.message
          : `Request failed with ${response.status}.`,
      typeof payload.code === 'string'
        ? payload.code
        : typeof payload.message === 'object' && typeof payload.message?.code === 'string'
          ? payload.message.code
          : 'request_failed',
    );
  }

  getApiKeyMe() {
    return this.request<{
      userId: string;
      username: string;
      displayName: string;
      keyPrefix: string | null;
    }>('/auth/api-key/me');
  }

  createCliAuthSession(input: {
    deviceName: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }) {
    return this.request<{
      sessionId: string;
      expiresAt: string;
      authorizeUrl: string;
    }>('/auth/cli/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  exchangeCliAuthSession(input: {
    sessionId: string;
    authorizationCode: string;
    codeVerifier: string;
  }) {
    return this.request<{
      apiKey: string;
      keyPrefix: string;
      userId: string;
      username: string;
      displayName: string;
    }>('/auth/cli/exchange', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listNotes(input?: { tag?: string; sort?: 'updatedAt' | 'createdAt' | 'title' }) {
    return this.request<UserNote[]>(this.buildPath('/notes/me', input));
  }

  searchNotes(query: string) {
    return this.request<UserNote[]>(this.buildPath('/notes/me/search', { q: query }));
  }

  listStarredNotes(input?: { tag?: string; sort?: 'updatedAt' | 'createdAt' | 'title' }) {
    return this.request<Array<{ note: UserNote }>>(this.buildPath('/notes/me/starred', input));
  }

  listDeletedNotes(input?: { sort?: 'updatedAt' | 'createdAt' | 'title' }) {
    return this.request<UserNote[]>(this.buildPath('/notes/me/deleted', input));
  }

  getNote(id: string) {
    return this.request<UserNote>(`/notes/${id}`);
  }

  updateNote(
    id: string,
    input: {
      rawText: string;
      title?: string | null;
    },
  ) {
    return this.request<UserNote>(`/notes/${id}/content`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  updateNoteMetadata(
    id: string,
    input: {
      visibility?: 'public' | 'private';
    },
  ) {
    return this.request<UserNote>(`/notes/${id}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  toggleStar(id: string) {
    return this.request<UserNote>(`/notes/${id}/star`, {
      method: 'PATCH',
    });
  }

  togglePin(id: string) {
    return this.request<UserNote>(`/notes/${id}/pin`, {
      method: 'PATCH',
    });
  }
}
