import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search, Trash2 } from 'lucide-react';
import { useMcpStore } from '../stores/mcp-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type McpProtocolLog = {
  id: string;
  server_id: string;
  direction: 'sent' | 'received';
  message_type: string;
  method: string | null;
  payload_json: string;
  timestamp: string;
};

const api = window.electronAPI?.mcpDebug;

const MESSAGE_TYPES = ['all', 'initialize', 'initialized', 'tools/list', 'tools/call', 'notification'] as const;
type TypeFilter = (typeof MESSAGE_TYPES)[number];

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function payloadSize(json: string): string {
  const bytes = new TextEncoder().encode(json).length;
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export default function McpDebugPage() {
  const { servers, protocolLogs, setProtocolLogs, addProtocolLog } = useMcpStore();

  const [serverFilter, setServerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load logs on mount
  useEffect(() => {
    if (!api) return;
    let cancelled = false;

    api.getLogs().then((items: McpProtocolLog[]) => {
      if (!cancelled && items) {
        setProtocolLogs(items);
        setSelectedId(items.at(-1)?.id || null);
      }
    });

    const remove = api.onLogEvent((event: McpProtocolLog & { cleared?: boolean }) => {
      if (event?.cleared) {
        setProtocolLogs([]);
        setSelectedId(null);
        return;
      }
      addProtocolLog(event as McpProtocolLog);
      if (autoScroll) {
        setSelectedId((event as McpProtocolLog).id);
      }
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [autoScroll, setProtocolLogs, addProtocolLog]);

  // Auto-scroll
  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [protocolLogs, autoScroll]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return protocolLogs.filter((log: McpProtocolLog) => {
      if (serverFilter !== 'all' && log.server_id !== serverFilter) return false;
      if (typeFilter !== 'all' && log.message_type !== typeFilter) return false;
      if (q) {
        const haystack = `${log.message_type} ${log.method || ''} ${log.payload_json}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [protocolLogs, serverFilter, typeFilter, searchQuery]);

  const selected = filteredLogs.find((log: McpProtocolLog) => log.id === selectedId) || null;

  const serverName = (id: string) => {
    const server = servers.find((s) => s.id === id);
    return server?.name || id.slice(0, 8);
  };

  const handleExport = async () => {
    if (!api) return;
    const json = await api.exportLogs(serverFilter === 'all' ? undefined : serverFilter);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    if (!api) return;
    await api.clearLogs(serverFilter === 'all' ? undefined : serverFilter);
    setProtocolLogs([]);
    setSelectedId(null);
  };

  const copyPayload = () => {
    if (!selected) return;
    navigator.clipboard.writeText(
      JSON.stringify(JSON.parse(selected.payload_json || '{}'), null, 2)
    );
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {/* Server filter */}
        <select
          value={serverFilter}
          onChange={(e) => setServerFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All Servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {MESSAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All Types' : t}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative min-w-48 flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter messages..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Auto-scroll toggle */}
        <Button
          variant={autoScroll ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAutoScroll((v) => !v)}
        >
          Auto-scroll
        </Button>

        {/* Export */}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport}>
          <Download size={14} />
          Export
        </Button>

        {/* Clear */}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleClear}>
          <Trash2 size={14} />
          Clear
        </Button>
      </div>

      {/* Log List */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No protocol messages
          </div>
        ) : (
          <div>
            {filteredLogs.map((log: McpProtocolLog) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedId(log.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-1.5 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:outline-none',
                  selected?.id === log.id && 'bg-primary/5'
                )}
              >
                {/* Timestamp */}
                <span className="shrink-0 font-mono text-muted-foreground">
                  {formatTimestamp(log.timestamp)}
                </span>

                {/* Server name */}
                <span className="shrink-0 max-w-24 truncate text-muted-foreground">
                  {serverName(log.server_id)}
                </span>

                {/* Direction */}
                <span className="shrink-0">
                  {log.direction === 'sent' ? (
                    <ArrowUp size={14} className="text-blue-500" />
                  ) : (
                    <ArrowDown size={14} className="text-green-500" />
                  )}
                </span>

                {/* Message type badge */}
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px]">
                  {log.message_type}
                </span>

                {/* Method */}
                <span className="min-w-0 flex-1 truncate">{log.method || '-'}</span>

                {/* Payload size */}
                <span className="shrink-0 text-right text-muted-foreground">
                  {payloadSize(log.payload_json || '{}')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="max-h-[40%] overflow-auto border-t">
          {/* Detail header */}
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex items-center gap-2 text-xs">
              {selected.direction === 'sent' ? (
                <ArrowUp size={14} className="text-blue-500" />
              ) : (
                <ArrowDown size={14} className="text-green-500" />
              )}
              <span className="font-mono">{selected.message_type}</span>
              {selected.method && <span className="text-muted-foreground">{selected.method}</span>}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={copyPayload}>
              Copy
            </Button>
          </div>

          {/* Payload */}
          <pre className="overflow-auto p-4 text-xs leading-relaxed">
            <code>
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(selected.payload_json || '{}'), null, 2);
                } catch {
                  return selected.payload_json || '{}';
                }
              })()}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
