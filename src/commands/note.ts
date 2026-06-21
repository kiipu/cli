import { formatNoteCollection, formatNoteDetail, type CliNote } from '../lib/note-formatters.js';
import { KiipuUserApiClient, type UserNote } from '../lib/kiipu-user-client.js';
import { executeNoteAction, type NoteCommandAction } from '../lib/note-actions.js';
import type { CliCommandResult, KiipuCliConfig } from '../types/index.js';
import { hasFlag, readFlag } from '../utils/args.js';

type ExtendedNoteCommandAction =
  | NoteCommandAction
  | 'list'
  | 'search'
  | 'show'
  | 'update'
  | 'star'
  | 'pin';

const actions = new Set<ExtendedNoteCommandAction>([
  'create',
  'delete',
  'restore',
  'purge',
  'list',
  'search',
  'show',
  'update',
  'star',
  'pin',
]);

const sortValues = new Set(['updatedAt', 'createdAt', 'title']);

function usage(action?: ExtendedNoteCommandAction): string {
  switch (action) {
    case 'create':
      return 'Usage: kiipu note create --content "<text>" [--title "<title>"]\n   or: kiipu note create "<text>" [--title "<title>"]';
    case 'list':
      return 'Usage: kiipu note list [--tag <tag>] [--sort <updatedAt|createdAt|title>] [--starred] [--deleted]';
    case 'search':
      return 'Usage: kiipu note search <query>\n   or: kiipu note search --query "<query>"';
    case 'show':
      return 'Usage: kiipu note show --id <noteId>';
    case 'update':
      return 'Usage: kiipu note update --id <noteId> [--content "<text>" [--title "<title>"]] [--visibility public|private]';
    case 'star':
      return 'Usage: kiipu note star --id <noteId>';
    case 'pin':
      return 'Usage: kiipu note pin --id <noteId>';
    default:
      return `Usage: kiipu note ${action} --id <noteId>`;
  }
}

function error(message: string): CliCommandResult {
  return { ok: false, message };
}

function getUserClient(config: KiipuCliConfig) {
  const apiKey = config.apiKey ?? process.env.KIIPU_API_KEY ?? '';
  if (!apiKey) {
    return null;
  }

  return new KiipuUserApiClient({
    apiBaseUrl: config.apiBaseUrl,
    apiKey,
  });
}

function requireUserClient(config: KiipuCliConfig) {
  const client = getUserClient(config);
  if (!client) {
    return {
      error: error('Kiipu API key is missing. Run `kiipu auth login` first.'),
    };
  }

  return { client };
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

function validateSort(sort?: string) {
  if (!sort) {
    return undefined;
  }

  return sortValues.has(sort) ? (sort as 'updatedAt' | 'createdAt' | 'title') : null;
}

function parseNoteId(args: string[], action: ExtendedNoteCommandAction) {
  const noteId = readFlag(args, '--id')?.trim();
  return noteId ? noteId : error(usage(action));
}

function toCliNote(note: UserNote): CliNote {
  return {
    id: note.id,
    title: note.title,
    rawText: note.rawText,
    finalText: note.finalText,
    visibility: note.visibility,
    tags: note.tags,
    folder: note.folder ?? null,
    isPinned: note.isPinned,
    isStarred: note.isStarred,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

async function handleMutationAction(
  config: KiipuCliConfig,
  action: NoteCommandAction,
  args: string[],
): Promise<CliCommandResult> {
  if (action === 'create') {
    const content = (
      readFlag(args, '--content') ?? stripKnownFlags(args, ['--content', '--title'])[0]
    )?.trim();
    if (!content) {
      return error(usage('create'));
    }

    const title = readFlag(args, '--title')?.trim();
    return executeNoteAction(config, { action: 'create', content, ...(title ? { title } : {}) });
  }

  const noteId = parseNoteId(args, action);
  if (typeof noteId !== 'string') {
    return noteId;
  }

  return executeNoteAction(config, { action, noteId });
}

async function handleList(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = requireUserClient(config);
  if (!client) {
    return clientError;
  }

  const sort = validateSort(readFlag(args, '--sort'));
  if (sort === null) {
    return error(`Invalid --sort value. ${usage('list')}`);
  }

  const starred = hasFlag(args, '--starred');
  const deleted = hasFlag(args, '--deleted');
  if (starred && deleted) {
    return error(`--starred and --deleted cannot be used together.\n${usage('list')}`);
  }

  const tag = readFlag(args, '--tag');
  let notes: CliNote[];
  let responseData: UserNote[] | Array<{ note: UserNote }>;

  if (starred) {
    const response = await client.listStarredNotes({ tag, sort });
    if (!response.ok) {
      return error(response.error.message);
    }

    notes = response.data.map((entry) => toCliNote(entry.note));
    responseData = response.data;
  } else if (deleted) {
    const response = await client.listDeletedNotes({ sort });
    if (!response.ok) {
      return error(response.error.message);
    }

    notes = response.data.map(toCliNote);
    responseData = response.data;
  } else {
    const response = await client.listNotes({ tag, sort });
    if (!response.ok) {
      return error(response.error.message);
    }

    notes = response.data.map(toCliNote);
    responseData = response.data;
  }

  const title = starred ? 'Starred notes' : deleted ? 'Deleted notes' : 'Notes';

  return {
    ok: true,
    message: formatNoteCollection(title, notes),
    data: responseData,
  };
}

async function handleSearch(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = requireUserClient(config);
  if (!client) {
    return clientError;
  }

  const query = (readFlag(args, '--query') ?? stripKnownFlags(args, ['--query'])[0])?.trim();
  if (!query) {
    return error(usage('search'));
  }

  const response = await client.searchNotes(query);
  if (!response.ok) {
    return error(response.error.message);
  }

  return {
    ok: true,
    message: formatNoteCollection(`Search results for "${query}"`, response.data.map(toCliNote)),
    data: response.data,
  };
}

async function handleShow(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = requireUserClient(config);
  if (!client) {
    return clientError;
  }

  const noteId = parseNoteId(args, 'show');
  if (typeof noteId !== 'string') {
    return noteId;
  }

  const response = await client.getNote(noteId);
  if (!response.ok) {
    return error(response.error.message);
  }

  return {
    ok: true,
    message: formatNoteDetail(toCliNote(response.data)),
    data: response.data,
  };
}

async function handleUpdate(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = requireUserClient(config);
  if (!client) {
    return clientError;
  }

  const noteId = parseNoteId(args, 'update');
  if (typeof noteId !== 'string') {
    return noteId;
  }

  const content = readFlag(args, '--content')?.trim();

  const visibility = readFlag(args, '--visibility');
  if (visibility && visibility !== 'public' && visibility !== 'private') {
    return error(`Invalid --visibility value. ${usage('update')}`);
  }

  const title = readFlag(args, '--title');
  const tags = readFlag(args, '--tags');
  if (tags !== undefined) {
    return error('Tags are now derived from note content. Add #tag directly in --content.');
  }

  if (!content && title !== undefined) {
    return error(`--title requires --content. ${usage('update')}`);
  }

  if (!content && !visibility) {
    return error(usage('update'));
  }

  let updatedNote;

  if (content) {
    const response = await client.updateNote(noteId, {
      rawText: content,
      ...(title !== undefined ? { title: title || null } : {}),
    });

    if (!response.ok) {
      return error(response.error.message);
    }

    updatedNote = response.data;
  }

  if (visibility === 'public' || visibility === 'private') {
    const response = await client.updateNoteMetadata(noteId, {
      visibility,
    });

    if (!response.ok) {
      return error(response.error.message);
    }

    updatedNote = response.data;
  }

  if (!updatedNote) {
    return error(usage('update'));
  }

  return {
    ok: true,
    message: `Note updated.\n\n${formatNoteDetail(toCliNote(updatedNote))}`,
    data: updatedNote,
  };
}

async function handleStar(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = requireUserClient(config);
  if (!client) {
    return clientError;
  }

  const noteId = parseNoteId(args, 'star');
  if (typeof noteId !== 'string') {
    return noteId;
  }

  const response = await client.toggleStar(noteId);
  if (!response.ok) {
    return error(response.error.message);
  }

  return {
    ok: true,
    message: response.data.isStarred
      ? `Note starred. ${response.data.id}`
      : `Note unstarred. ${response.data.id}`,
    data: response.data,
  };
}

async function handlePin(config: KiipuCliConfig, args: string[]): Promise<CliCommandResult> {
  const { client, error: clientError } = requireUserClient(config);
  if (!client) {
    return clientError;
  }

  const noteId = parseNoteId(args, 'pin');
  if (typeof noteId !== 'string') {
    return noteId;
  }

  const response = await client.togglePin(noteId);
  if (!response.ok) {
    return error(response.error.message);
  }

  return {
    ok: true,
    message: response.data.isPinned
      ? `Note pinned. ${response.data.id}`
      : `Note unpinned. ${response.data.id}`,
    data: response.data,
  };
}

export async function runNoteCommand(
  config: KiipuCliConfig,
  args: string[],
): Promise<CliCommandResult> {
  const action = args[1] as ExtendedNoteCommandAction | undefined;
  if (!action || !actions.has(action)) {
    return error(
      'Usage: kiipu note <create|delete|restore|purge|list|search|show|update|star|pin> [options]',
    );
  }

  const actionArgs = args.slice(2);

  switch (action) {
    case 'create':
    case 'delete':
    case 'restore':
    case 'purge':
      return handleMutationAction(config, action, actionArgs);
    case 'list':
      return handleList(config, actionArgs);
    case 'search':
      return handleSearch(config, actionArgs);
    case 'show':
      return handleShow(config, actionArgs);
    case 'update':
      return handleUpdate(config, actionArgs);
    case 'star':
      return handleStar(config, actionArgs);
    case 'pin':
      return handlePin(config, actionArgs);
  }

  return error('Unsupported note action.');
}
