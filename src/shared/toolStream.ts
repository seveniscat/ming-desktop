/** UI / persistence record for a single tool invocation. */
export interface ToolCallRecord {
  id: string;
  toolName: string;
  args?: Record<string, any>;
  argsText?: string;
  result?: string;
  error?: string;
  status: 'running' | 'complete' | 'incomplete' | 'requires-action';
  approvalPayload?: { requestId: string; toolName: string; params: Record<string, any> };
  startedAt?: number;
  duration?: number;
}

export interface ToolStreamEventPayload {
  event: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: string;
  error?: string;
  duration?: number;
  timestamp?: number;
}

export function upsertToolCallRecord(
  records: ToolCallRecord[],
  record: ToolCallRecord,
): ToolCallRecord[] {
  const idx = records.findIndex((tc) => tc.id === record.id);
  if (idx >= 0) {
    const next = [...records];
    next[idx] = record;
    return next;
  }
  return [...records, record];
}

/**
 * Apply a stream tool event onto an existing records array.
 * `context` and other non-execution events are ignored.
 */
export function applyToolStreamEventToRecords(
  records: ToolCallRecord[],
  data: ToolStreamEventPayload,
): ToolCallRecord[] {
  if (data.event === 'tool_start' && data.toolName) {
    return upsertToolCallRecord(records, {
      id: `${data.toolName}-${data.timestamp}`,
      toolName: data.toolName,
      args: data.args,
      argsText: data.args ? JSON.stringify(data.args, null, 2) : undefined,
      status: 'running',
      startedAt: data.timestamp,
    });
  }

  if (data.event === 'tool_result' && data.toolName) {
    const idx = records.findIndex(
      (tc) => tc.toolName === data.toolName && tc.status === 'running',
    );
    if (idx < 0) return records;
    const next = [...records];
    next[idx] = {
      ...next[idx],
      status: 'complete',
      result: data.result,
      duration: data.duration,
    };
    return next;
  }

  if (data.event === 'tool_error' && data.toolName) {
    const idx = records.findIndex(
      (tc) => tc.toolName === data.toolName && tc.status === 'running',
    );
    if (idx < 0) return records;
    const next = [...records];
    next[idx] = {
      ...next[idx],
      status: 'incomplete',
      error: data.error,
    };
    return next;
  }

  return records;
}

export function applyToolStreamEventToMessages<
  T extends { role: string; toolCalls?: ToolCallRecord[] },
>(messages: T[], data: ToolStreamEventPayload): T[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return messages;

  const existing = last.toolCalls ?? [];
  const toolCalls = applyToolStreamEventToRecords(existing, data);
  if (toolCalls === existing) return messages;

  const updated = [...messages];
  updated[updated.length - 1] = { ...last, toolCalls };
  return updated;
}

export function parsePersistedToolCalls(raw: unknown): ToolCallRecord[] | undefined {
  if (raw == null || raw === '') return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed.filter(
      (item): item is ToolCallRecord =>
        Boolean(item) && typeof item.id === 'string' && typeof item.toolName === 'string',
    );
  } catch {
    return undefined;
  }
}
