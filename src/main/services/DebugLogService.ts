import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { DebugLogEntry, DebugLogLevel, DebugModelCall, UIStallReport } from '../../shared/types';

const MAX_LOGS = 1000;

type DebugLogInput = Omit<DebugLogEntry, 'id'>;

function compact(value: unknown, maxLength = 360): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
}

export class DebugLogService extends EventEmitter {
  private entries: DebugLogEntry[] = [];

  add(input: DebugLogInput): DebugLogEntry {
    const entry: DebugLogEntry = {
      ...input,
      id: `${input.timestamp}-${randomUUID().slice(0, 8)}`,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_LOGS) {
      this.entries.splice(0, this.entries.length - MAX_LOGS);
    }

    this.emit('entry', entry);
    return entry;
  }

  list(): DebugLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.emit('clear');
  }

  addModelCall(event: DebugModelCall, source = 'agent'): DebugLogEntry {
    const data = event.data || {};
    const level: DebugLogLevel = event.type === 'error'
      ? 'error'
      : typeof data.duration === 'number' && data.duration > 8000
        ? 'warning'
        : 'info';

    return this.add({
      timestamp: event.timestamp || Date.now(),
      category: 'llm',
      type: event.type,
      level,
      source,
      conversationId: event.conversationId,
      duration: data.duration,
      title: this.modelTitle(event),
      detail: this.modelDetail(event),
      data,
    });
  }

  addUIStall(report: UIStallReport): DebugLogEntry {
    const duration = Math.round(report.duration);
    const blockedFor = report.blockedFor == null ? undefined : Math.round(report.blockedFor);
    const level: DebugLogLevel = duration >= 1000 ? 'error' : duration >= 250 ? 'warning' : 'info';

    return this.add({
      timestamp: report.startedAt || Date.now(),
      category: 'ui',
      type: report.type,
      level,
      source: report.source || 'renderer',
      duration,
      title: report.type === 'long-task' ? `Long task ${duration}ms` : `Event loop delay ${duration}ms`,
      detail: blockedFor == null ? undefined : `Blocked for ${blockedFor}ms`,
      data: { ...report, duration },
    });
  }

  private modelTitle(event: DebugModelCall): string {
    const data = event.data || {};
    const model = data.model ? ` ${data.model}` : '';
    const provider = data.provider ? `${data.provider}` : 'LLM';

    if (event.type === 'request') return `${provider}${model} request`;
    if (event.type === 'response') return `${provider}${model} response`;
    if (event.type === 'chunk') return `${provider}${model} chunk`;
    if (event.type === 'tool') return data.toolName ? `Tool ${data.toolName}` : 'Tool call';
    if (event.type === 'error') return `${provider}${model} error`;
    return `${provider}${model}`;
  }

  private modelDetail(event: DebugModelCall): string | undefined {
    const data = event.data || {};

    if (event.type === 'request') {
      const messageCount = data.messages?.length || 0;
      const tools = data.tools?.length ? `, tools: ${data.tools.join(', ')}` : '';
      return `Messages: ${messageCount}${tools}`;
    }

    if (event.type === 'tool') {
      return compact(data.toolResult || data.toolArgs || data.content);
    }

    if (event.type === 'error') {
      return compact(data.error || data.content);
    }

    return compact(data.content || data.usage);
  }
}
