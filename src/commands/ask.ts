import { KiipuAskClient, type AskSource, type AskUsage } from '../lib/ask-client.js';
import {
  formatAskFooter,
  formatConversationDetail,
  formatConversationHistory,
} from '../lib/ask-formatters.js';
import type { CliCommandResult, KiipuCliConfig } from '../types/index.js';
import { hasFlag, readFlag } from '../utils/args.js';

type AskCommandOptions = {
  stream?: boolean;
  write?: (chunk: string) => void;
};

type AskAnswerData = {
  answer: string;
  conversationId?: string;
  title?: string | null;
  turnId?: string;
  sources: AskSource[];
  usage?: AskUsage;
};

const sourceModes = new Set(['fresh', 'locked']);

function error(message: string, data?: Record<string, unknown>): CliCommandResult {
  return {
    ok: false,
    message,
    ...(data ? { data, json: { ok: false, message, ...data } } : {}),
  };
}

function usage(action?: 'history' | 'show') {
  if (action === 'history') {
    return 'Usage: kiipu ask history [--query <q>] [--limit <n>] [--archived]';
  }

  if (action === 'show') {
    return 'Usage: kiipu ask show --id <conversationId>';
  }

  return [
    'Usage: kiipu ask "question"',
    '   or: kiipu ask --question "question"',
    '   or: kiipu ask --conversation-id <id> "follow-up"',
  ].join('\n');
}

function getAskClient(config: KiipuCliConfig) {
  const apiKey = config.apiKey ?? process.env.KIIPU_API_KEY ?? '';
  if (!apiKey) {
    return {
      error: error('Kiipu API key is missing. Run `kiipu auth login` first.', {
        code: 'missing_api_key',
      }),
    };
  }

  return {
    client: new KiipuAskClient({
      apiBaseUrl: config.apiBaseUrl,
      apiKey,
    }),
  };
}

function stripKnownFlags(args: string[], flagsWithValues: string[]) {
  const positional: string[] = [];
  const flags = new Set(flagsWithValues);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (flags.has(arg)) {
      index += 1;
      continue;
    }

    if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return positional;
}

function parseTopK(args: string[]) {
  const raw = readFlag(args, '--top-k');
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    return null;
  }

  return value;
}

function parseLimit(args: string[]) {
  const raw = readFlag(args, '--limit');
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    return null;
  }

  return value;
}

function parseSourceMode(args: string[]) {
  const value = readFlag(args, '--source-mode');
  if (!value) {
    return undefined;
  }

  return sourceModes.has(value) ? (value as 'fresh' | 'locked') : null;
}

function readQuestion(args: string[]) {
  const explicit = readFlag(args, '--question')?.trim();
  if (explicit) {
    return explicit;
  }

  return stripKnownFlags(args, ['--question', '--conversation-id', '--top-k', '--source-mode'])
    .join(' ')
    .trim();
}

async function handleHistory(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = getAskClient(config);
  if (!client) {
    return clientError;
  }

  const limit = parseLimit(args);
  if (limit === null) {
    return error(`Invalid --limit value. ${usage('history')}`, { code: 'invalid_limit' });
  }

  const response = await client.listConversations({
    query: readFlag(args, '--query'),
    limit,
    archived: hasFlag(args, '--archived'),
  });
  if (!response.ok) {
    return error(response.error.message, response.error);
  }

  return {
    ok: true,
    message: formatConversationHistory(
      hasFlag(args, '--archived') ? 'Archived Ask conversations' : 'Ask conversations',
      response.data.items,
      response.data.nextCursor,
    ),
    data: response.data,
  };
}

async function handleShow(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = getAskClient(config);
  if (!client) {
    return clientError;
  }

  const id = readFlag(args, '--id')?.trim();
  if (!id) {
    return error(usage('show'), { code: 'missing_conversation_id' });
  }

  const response = await client.getConversation(id);
  if (!response.ok) {
    return error(response.error.message, response.error);
  }

  return {
    ok: true,
    message: formatConversationDetail(response.data),
    data: response.data,
  };
}

async function handleQuestion(
  config: KiipuCliConfig,
  args: string[],
  options: AskCommandOptions,
): Promise<CliCommandResult> {
  const { client, error: clientError } = getAskClient(config);
  if (!client) {
    return clientError;
  }

  const question = readQuestion(args);
  if (!question) {
    return error(usage(), { code: 'missing_question' });
  }

  const topK = parseTopK(args);
  if (topK === null) {
    return error(`Invalid --top-k value. ${usage()}`, { code: 'invalid_top_k' });
  }

  const sourceMode = parseSourceMode(args);
  if (sourceMode === null) {
    return error('Invalid --source-mode value. Use fresh or locked.', {
      code: 'invalid_source_mode',
    });
  }

  const result: AskAnswerData = {
    answer: '',
    conversationId: readFlag(args, '--conversation-id')?.trim() || undefined,
    sources: [],
  };
  const targetConversationId = result.conversationId ?? 'new';

  for await (const event of client.streamMessage({
    conversationId: targetConversationId,
    question,
    topK,
    sourceMode,
  })) {
    switch (event.type) {
      case 'meta':
        result.conversationId = event.conversationId;
        result.title = event.title;
        break;
      case 'sources':
        result.sources = event.sources;
        break;
      case 'delta':
        result.answer += event.text;
        if (options.stream) {
          options.write?.(event.text);
        }
        break;
      case 'done':
        result.turnId = event.turnId;
        result.usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          latencyMs: event.latencyMs,
        };
        break;
      case 'title':
        result.conversationId = event.conversationId;
        result.title = event.title;
        break;
      case 'error':
        return error(event.message, {
          code: event.code,
          answer: result.answer,
          conversationId: result.conversationId,
          title: result.title,
          turnId: result.turnId,
          sources: result.sources,
          usage: result.usage,
        });
    }
  }

  const footer = formatAskFooter(result);
  return {
    ok: true,
    message: options.stream ? footer : `${result.answer}${footer}`,
    data: result,
    json: {
      ok: true,
      ...result,
    },
  };
}

export async function runAskCommand(
  config: KiipuCliConfig,
  args: string[],
  options: AskCommandOptions = {},
): Promise<CliCommandResult> {
  const action = args[1];
  const actionArgs = args.slice(2);

  if (action === 'history') {
    return handleHistory(config, actionArgs);
  }

  if (action === 'show') {
    return handleShow(config, actionArgs);
  }

  return handleQuestion(config, args.slice(1), options);
}
