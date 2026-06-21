import type {
  AskConversationDetail,
  AskConversationSummary,
  AskConversationTurn,
  AskSource,
  AskUsage,
} from './ask-client.js';

function formatTimestamp(value?: string | null) {
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

function truncate(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function formatSourceLine(source: AskSource) {
  const title = source.title?.trim() || '(untitled)';
  const score = Number.isFinite(source.score) ? ` score ${source.score.toFixed(3)}` : '';
  return `[${source.index}] ${title} (${source.noteId})${score}`;
}

export function formatAskFooter(input: {
  conversationId?: string;
  title?: string | null;
  turnId?: string;
  sources: AskSource[];
  usage?: AskUsage;
}) {
  const lines = ['', 'Sources:'];

  if (input.sources.length === 0) {
    lines.push('  none');
  } else {
    for (const source of input.sources) {
      lines.push(`  ${formatSourceLine(source)}`);
      lines.push(`    ${truncate(source.snippet, 140)}`);
    }
  }

  const usage = input.usage;
  if (usage) {
    lines.push(
      '',
      `Usage: input ${usage.inputTokens}, output ${usage.outputTokens}, latency ${usage.latencyMs}ms`,
    );
  }

  if (input.conversationId) {
    lines.push(`Conversation: ${input.conversationId}`);
  }

  if (input.title) {
    lines.push(`Title: ${input.title}`);
  }

  if (input.turnId) {
    lines.push(`Turn: ${input.turnId}`);
  }

  return lines.join('\n');
}

export function formatConversationHistory(
  title: string,
  conversations: AskConversationSummary[],
  nextCursor?: string | null,
) {
  const lines = [title, ''];

  if (conversations.length === 0) {
    lines.push('No Ask conversations found.');
    return lines.join('\n');
  }

  for (const item of conversations) {
    const label = item.title?.trim() || truncate(item.preview, 80) || '(untitled)';
    const flags = [item.pinnedAt ? 'pinned' : '', item.archivedAt ? 'archived' : '']
      .filter(Boolean)
      .join(', ');
    lines.push(`${item.id}  ${formatTimestamp(item.lastMessageAt)}`);
    lines.push(`  ${label}`);
    if (flags) {
      lines.push(`  flags: ${flags}`);
    }
    lines.push('');
  }

  if (nextCursor) {
    lines.push(`Next cursor: ${nextCursor}`);
  }

  if (!nextCursor && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

function formatTurn(turn: AskConversationTurn) {
  const role = turn.role === 'user' ? 'User' : 'Assistant';
  const lines = [`${role} ${turn.id}  ${formatTimestamp(turn.createdAt)}  status: ${turn.status}`];
  if (turn.errorCode) {
    lines.push(`error: ${turn.errorCode}`);
  }
  lines.push(turn.content.trim() || '(empty)');

  if (turn.sources && turn.sources.length > 0) {
    lines.push('sources:');
    for (const source of turn.sources) {
      lines.push(`  ${formatSourceLine(source)}`);
    }
  }

  return lines.join('\n');
}

export function formatConversationDetail(detail: AskConversationDetail) {
  const lines = [
    detail.title?.trim() || '(untitled Ask conversation)',
    '',
    `id: ${detail.id}`,
    `created: ${formatTimestamp(detail.createdAt)}`,
    `updated: ${formatTimestamp(detail.lastMessageAt)}`,
    '',
  ];

  if (detail.turns.length === 0) {
    lines.push('No turns found.');
  } else {
    for (const turn of detail.turns) {
      lines.push(formatTurn(turn), '');
    }
  }

  return lines.slice(0, -1).join('\n');
}
