import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bug, Clock, Cpu, Eraser, ExternalLink, Radio, Search, Trash2 } from 'lucide-react';
import type { DebugLogCategory, DebugLogEntry, DebugLogLevel } from '../../shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const categoryLabels: Record<DebugLogCategory | 'all', string> = {
  all: 'All',
  llm: 'LLM',
  ui: 'UI',
};

const levelLabels: Record<DebugLogLevel | 'all', string> = {
  all: 'All',
  info: 'Info',
  warning: 'Warn',
  error: 'Error',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
  return `${time}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function getLevelClass(level: DebugLogLevel): string {
  if (level === 'error') return 'border-red-500/40 bg-red-500/10 text-red-500';
  if (level === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-500';
  return 'border-sky-500/40 bg-sky-500/10 text-sky-500';
}

function getCategoryIcon(category: DebugLogCategory) {
  return category === 'llm' ? <Cpu size={15} /> : <Activity size={15} />;
}

function dataPreview(entry: DebugLogEntry): string {
  if (!entry.data) return '';
  return JSON.stringify(entry.data, null, 2);
}

export default function DebugPanel() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [category, setCategory] = useState<DebugLogCategory | 'all'>('all');
  const [level, setLevel] = useState<DebugLogLevel | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    window.electronAPI.debug.getLogs().then((items) => {
      if (!cancelled) {
        setLogs(items);
        setSelectedId((current) => current || items.at(-1)?.id || null);
      }
    });

    const remove = window.electronAPI.debug.onLogEvent((event) => {
      if (event?.cleared) {
        setLogs([]);
        setSelectedId(null);
        return;
      }

      setLogs((current) => {
        const next = [...current, event].slice(-1000);
        if (autoScroll) {
          setSelectedId(event.id);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [autoScroll]);

  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs, autoScroll]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false;
      if (level !== 'all' && entry.level !== level) return false;
      if (!normalizedQuery) return true;
      const haystack = `${entry.title} ${entry.detail || ''} ${entry.source || ''} ${entry.type}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [category, level, logs, query]);

  const selected = filteredLogs.find((entry) => entry.id === selectedId) || filteredLogs.at(-1) || null;
  const llmCount = logs.filter((entry) => entry.category === 'llm').length;
  const uiCount = logs.filter((entry) => entry.category === 'ui').length;
  const issueCount = logs.filter((entry) => entry.level !== 'info').length;

  const clearLogs = async () => {
    await window.electronAPI.debug.clearLogs();
  };

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden">
      <div className="drag-region h-8 border-b bg-secondary" />
      <main className="h-[calc(100vh-2rem)] flex flex-col min-w-0">
        <header className="no-drag flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Bug size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">Debug Panel</h1>
              <p className="text-xs text-muted-foreground">LLM calls and renderer stalls</p>
            </div>
          </div>

          <div className="ml-auto grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground">LLM</div>
              <div className="font-mono text-base">{llmCount}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground">UI</div>
              <div className="font-mono text-base">{uiCount}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground">Issues</div>
              <div className="font-mono text-base">{issueCount}</div>
            </div>
          </div>
        </header>

        <div className="no-drag flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <div className="relative min-w-56 flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 pl-9"
              placeholder="Search logs"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'llm', 'ui'] as const).map((item) => (
              <Button
                key={item}
                variant={category === item ? 'default' : 'outline'}
                size="sm"
                className="h-9"
                onClick={() => setCategory(item)}
              >
                {categoryLabels[item]}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'info', 'warning', 'error'] as const).map((item) => (
              <Button
                key={item}
                variant={level === item ? 'default' : 'outline'}
                size="sm"
                className="h-9"
                onClick={() => setLevel(item)}
              >
                {levelLabels[item]}
              </Button>
            ))}
          </div>

          <Button
            variant={autoScroll ? 'secondary' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setAutoScroll((value) => !value)}
          >
            <Radio size={15} />
            Live
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={clearLogs}>
            <Trash2 size={15} />
            Clear
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] max-lg:grid-cols-1">
          <section ref={scrollRef} className="min-h-0 overflow-y-auto border-r max-lg:border-r-0">
            {filteredLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No logs match the current filters.
              </div>
            ) : (
              <div className="divide-y">
                {filteredLogs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className={cn(
                      'grid w-full grid-cols-[130px_84px_minmax(0,1fr)_100px] gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected?.id === entry.id && 'bg-muted'
                    )}
                  >
                    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <Clock size={13} />
                      {formatTime(entry.timestamp)}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-medium">
                      {getCategoryIcon(entry.category)}
                      {entry.category.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{entry.title}</div>
                      {entry.detail && (
                        <div className="mt-1 truncate text-xs text-muted-foreground">{entry.detail}</div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Badge variant="outline" className={cn('h-6 rounded-md capitalize', getLevelClass(entry.level))}>
                        {entry.level}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto bg-muted/20 p-5 max-lg:hidden">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {getCategoryIcon(selected.category)}
                      <span>{selected.category.toUpperCase()}</span>
                      <span>{selected.type}</span>
                    </div>
                    <h2 className="mt-1 break-words text-base font-semibold">{selected.title}</h2>
                  </div>
                  <Badge variant="outline" className={cn('rounded-md capitalize', getLevelClass(selected.level))}>
                    {selected.level}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-background px-3 py-2">
                    <div className="text-muted-foreground">Time</div>
                    <div className="mt-1 font-mono">{formatTime(selected.timestamp)}</div>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <div className="text-muted-foreground">Duration</div>
                    <div className="mt-1 font-mono">{selected.duration == null ? '-' : `${Math.round(selected.duration)}ms`}</div>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <div className="text-muted-foreground">Source</div>
                    <div className="mt-1 truncate font-mono">{selected.source || '-'}</div>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2">
                    <div className="text-muted-foreground">Conversation</div>
                    <div className="mt-1 truncate font-mono">{selected.conversationId || '-'}</div>
                  </div>
                </div>

                {selected.detail && (
                  <div className="rounded-md border bg-background p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <AlertTriangle size={13} />
                      Detail
                    </div>
                    <p className="break-words text-sm leading-relaxed">{selected.detail}</p>
                  </div>
                )}

                <div className="rounded-md border bg-background">
                  <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Payload</span>
                    <ExternalLink size={13} />
                  </div>
                  <pre className="max-h-[42vh] overflow-auto p-3 text-xs leading-relaxed">
                    <code>{dataPreview(selected) || '{}'}</code>
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Eraser size={18} />
                Select a log entry.
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
