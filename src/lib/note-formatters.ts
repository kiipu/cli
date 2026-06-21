type NoteTag = {
  id?: string;
  tagName: string;
};

type NoteFolder = {
  id: string;
  name: string;
} | null;

export type CliNote = {
  id: string;
  title?: string | null;
  rawText?: string;
  finalText?: string;
  visibility: 'public' | 'private';
  tags?: NoteTag[];
  folder?: NoteFolder;
  isPinned?: boolean;
  isStarred?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function formatTimestamp(value?: string) {
  if (!value) {
    return 'unknown time';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTags(tags?: NoteTag[], limit?: number) {
  const normalized = Array.isArray(tags)
    ? tags
        .map((tag) => tag.tagName?.trim())
        .filter((tag): tag is string => Boolean(tag))
        .slice(0, limit)
    : [];

  return normalized.length > 0 ? normalized.map((tag) => `#${tag}`).join(', ') : 'none';
}

function getNotePreview(note: CliNote) {
  const content = (
    note.title?.trim() ||
    note.finalText?.trim() ||
    note.rawText?.trim() ||
    ''
  ).replace(/\s+/g, ' ');
  if (!content) {
    return '(empty)';
  }

  return content.length > 100 ? `${content.slice(0, 97)}...` : content;
}

function getStatusFlags(note: CliNote) {
  const flags = [];

  if (note.isPinned) {
    flags.push('pinned');
  }

  if (note.isStarred) {
    flags.push('starred');
  }

  return flags.length > 0 ? flags.join(', ') : 'none';
}

export function formatNoteCollection(title: string, notes: CliNote[]) {
  const lines = [title, ''];

  if (notes.length === 0) {
    lines.push('No notes found.');
    return lines.join('\n');
  }

  for (const note of notes) {
    lines.push(`${note.id}  ${formatTimestamp(note.updatedAt ?? note.createdAt)}`);
    lines.push(
      `  flags: ${getStatusFlags(note)}  visibility: ${note.visibility}  tags: ${formatTags(note.tags, 3)}`,
    );
    lines.push(`  ${getNotePreview(note)}`);
    lines.push('');
  }

  return lines.slice(0, -1).join('\n');
}

export function formatNoteDetail(note: CliNote) {
  const title = note.title?.trim() || '(untitled)';
  const body = note.finalText?.trim() || note.rawText?.trim() || '(empty)';

  return [
    title,
    '',
    body,
    '',
    `id: ${note.id}`,
    `visibility: ${note.visibility}`,
    `created: ${formatTimestamp(note.createdAt)}`,
    `updated: ${formatTimestamp(note.updatedAt)}`,
    `tags: ${formatTags(note.tags)}`,
    `folder: ${note.folder ? `${note.folder.name} (${note.folder.id})` : 'none'}`,
    `pinned: ${note.isPinned ? 'yes' : 'no'}`,
    `starred: ${note.isStarred ? 'yes' : 'no'}`,
  ].join('\n');
}
