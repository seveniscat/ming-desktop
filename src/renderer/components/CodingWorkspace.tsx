import { useState, useEffect, useRef, useCallback } from 'react';
import { Code2, FolderOpen, Send, Square, Terminal, Wrench, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TextEntry {
  kind: 'text';
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
interface ToolEntry {
  kind: 'tool';
  id: string;
  name: string;
  args: Record<string, any>;
  result?: string;
  isError?: boolean;
  running: boolean;
}
type Entry = TextEntry | ToolEntry;

let entrySeq = 0;
const nextId = () => `e${++entrySeq}`;

export default function CodingWorkspace() {
  const [workspace, setWorkspace] = useState('');
  const [model, setModel] = useState('');
  const [providers, setProviders] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantTailId = useRef<string | null>(null);

  // 加载 providers / 默认模型
  useEffect(() => {
    (async () => {
      try {
        const list = await window.electronAPI.llm.listProviders();
        setProviders(list || []);
        const first = list?.[0];
        if (first?.models?.length) setModel(first.models[0]);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // 订阅流式事件
  useEffect(() => {
    if (!sessionId) return;
    const api = window.electronAPI.coding;

    const unsubChunk = api.onChunk((data: any) => {
      if (data.sessionId && data.sessionId !== sessionId) return;
      setEntries((prev) => {
        const tail = prev[prev.length - 1];
        if (tail && tail.kind === 'text' && tail.role === 'assistant' && tail.id === assistantTailId.current) {
          const updated = { ...tail, text: tail.text + (data.content ?? '') };
          return [...prev.slice(0, -1), updated];
        }
        const entry: TextEntry = { kind: 'text', id: nextId(), role: 'assistant', text: data.content ?? '' };
        assistantTailId.current = entry.id;
        return [...prev, entry];
      });
    });

    const unsubTool = api.onToolEvent((data: any) => {
      if (data.sessionId && data.sessionId !== sessionId) return;
      if (data.event === 'tool_start') {
        setEntries((prev) => {
          assistantTailId.current = null;
          return [...prev, { kind: 'tool', id: nextId(), name: data.name, args: data.args || {}, running: true }];
        });
      } else if (data.event === 'tool_result') {
        setEntries((prev) => {
          const idx = [...prev].reverse().findIndex((e) => e.kind === 'tool' && e.running);
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const target = prev[realIdx] as ToolEntry;
          const updated: ToolEntry = { ...target, result: data.result, isError: data.isError, running: false };
          return [...prev.slice(0, realIdx), updated, ...prev.slice(realIdx + 1)];
        });
      } else if (data.event === 'max_turns') {
        setEntries((prev) => [...prev, { kind: 'text', id: nextId(), role: 'assistant', text: '⚠️ 达到最大轮次限制，已停止。' }]);
      }
    });

    const unsubEnd = api.onEnd((data: any) => {
      if (data?.sessionId && data.sessionId !== sessionId) return;
      setRunning(false);
      assistantTailId.current = null;
    });

    const unsubErr = api.onError((data: any) => {
      if (data?.sessionId && data.sessionId !== sessionId) return;
      setRunning(false);
      toast.error(data?.error || '会话出错');
    });

    return () => {
      unsubChunk();
      unsubTool();
      unsubEnd();
      unsubErr();
    };
  }, [sessionId]);

  // 自动滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  const pickWorkspace = useCallback(async () => {
    try {
      const res = await window.electronAPI.dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (res && !res.canceled && res.filePaths?.length) {
        setWorkspace(res.filePaths[0]);
      }
    } catch {
      toast.error('选择目录失败');
    }
  }, []);

  const startSession = useCallback(async () => {
    if (!workspace) {
      toast.error('请先选择工作目录');
      return;
    }
    try {
      setEntries([]);
      const id = await window.electronAPI.coding.create(workspace, model);
      setSessionId(id);
    } catch (e: any) {
      toast.error(e?.message || '创建会话失败');
    }
  }, [workspace, model]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !sessionId || running) return;
    setEntries((prev) => {
      assistantTailId.current = null;
      return [...prev, { kind: 'text', id: nextId(), role: 'user', text }];
    });
    setInput('');
    setRunning(true);
    window.electronAPI.coding.send(sessionId, text);
  }, [input, sessionId, running]);

  const stop = useCallback(() => {
    if (sessionId) window.electronAPI.coding.stop(sessionId);
  }, [sessionId]);

  // 未创建会话：配置面板
  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Code2 size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Coding Agent</h2>
              <p className="text-sm text-muted-foreground">模型无关的 agentic coding 工作台</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">工作目录</label>
            <div className="flex gap-2">
              <Input
                value={workspace}
                placeholder="选择一个代码目录…"
                readOnly
                className="flex-1"
              />
              <Button variant="outline" onClick={pickWorkspace}>
                <FolderOpen size={16} className="mr-1.5" /> 选择
              </Button>
            </div>

            <label className="text-sm font-medium">模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {providers.flatMap((p) => (p.models || []).map((m: string) => (
                <option key={`${p.id}:${m}`} value={m}>{p.name} · {m}</option>
              )))}
            </select>
          </div>

          <Button className="w-full" onClick={startSession} disabled={!workspace}>
            <Code2 size={16} className="mr-1.5" /> 开始会话
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部状态条 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[hsl(var(--border))] text-xs text-muted-foreground">
        <FolderOpen size={13} />
        <span className="truncate max-w-[40%]" title={workspace}>{workspace}</span>
        <Badge variant="secondary" className="font-normal">{model || '默认模型'}</Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => { if (sessionId) window.electronAPI.coding.dispose(sessionId); setSessionId(''); setEntries([]); }}>
          新会话
        </Button>
      </div>

      {/* 消息流 */}
      <ScrollArea className="flex-1" >
        <div ref={scrollRef} className="px-4 py-4 space-y-3 max-w-3xl mx-auto">
          {entries.map((e) => e.kind === 'text' ? (
            <MessageBubble key={e.id} role={e.role} text={e.text} />
          ) : (
            <ToolCard key={e.id} entry={e} />
          ))}
          {entries.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              描述你要完成的任务，agent 会读写文件、执行命令来完成它。
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 输入区 */}
      <div className="border-t border-[hsl(var(--border))] p-3">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={running ? 'agent 工作中…' : '给 coding agent 下达任务'}
            disabled={running}
            className="flex-1"
          />
          {running ? (
            <Button variant="destructive" onClick={stop}>
              <Square size={15} className="mr-1.5" /> 停止
            </Button>
          ) : (
            <Button onClick={send} disabled={!input.trim()}>
              <Send size={15} className="mr-1.5" /> 发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-[var(--surface-hover)] text-foreground'
        )}
      >
        {text}
      </div>
    </div>
  );
}

function ToolCard({ entry }: { entry: ToolEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = entry.name === 'execute_command' ? Terminal : Wrench;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-[hsl(var(--border))] text-xs">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-[var(--surface-hover)]">
        <Icon size={13} className={cn(entry.running ? 'text-primary' : entry.isError ? 'text-destructive' : 'text-muted-foreground')} />
        <span className="font-mono">{entry.name}</span>
        {entry.running ? (
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
        ) : entry.isError ? (
          <Badge variant="destructive" className="h-4 text-[10px] px-1">error</Badge>
        ) : (
          <Badge variant="secondary" className="h-4 text-[10px] px-1">done</Badge>
        )}
        <div className="flex-1" />
        <ChevronRight size={13} className={cn('text-muted-foreground transition-transform', open && 'rotate-90')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2.5 pb-2 space-y-1.5">
        <div>
          <span className="text-muted-foreground">args:</span>
          <pre className="mt-0.5 font-mono whitespace-pre-wrap break-all bg-[var(--surface)] rounded p-1.5">{JSON.stringify(entry.args, null, 2)}</pre>
        </div>
        {entry.result !== undefined && (
          <div>
            <span className="text-muted-foreground inline-flex items-center gap-1">
              {entry.isError && <AlertCircle size={11} className="text-destructive" />}result:
            </span>
            <pre className={cn('mt-0.5 font-mono whitespace-pre-wrap break-all rounded p-1.5 max-h-60 overflow-auto', entry.isError ? 'bg-destructive/10' : 'bg-[var(--surface)]')}>
              {entry.result}
            </pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
