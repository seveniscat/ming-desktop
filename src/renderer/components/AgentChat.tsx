import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Bot, User, Plus, Trash2, MessageSquare, Pencil, ChevronDown, Cpu, FileText, Wrench, Brain, CheckCircle2, AlertCircle, Radio, Sparkles, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { PromptTemplate } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
}

interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface LLMProvider {
  id: string;
  name: string;
  type: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
}

interface PromptSuggestion {
  id: string;
  name: string;
  trigger: string;
  description: string;
  content: string;
  type: 'builtin' | 'prompt';
}

interface ExecutionStep {
  id: string;
  type: 'request' | 'response' | 'chunk' | 'tool' | 'error';
  timestamp: number;
  title: string;
  detail?: string;
  status: 'active' | 'done' | 'error';
}

interface ExecutionState {
  steps: ExecutionStep[];
  collapsed: boolean;
  finished: boolean;
}

interface ChatLaunchRequest {
  agentName: string;
  message: string;
  model?: string;
  newConversation?: boolean;
  reuseAgentConversation?: boolean;
  autoSend?: boolean;
}

const DAILY_REPORT_AGENT_NAME = 'Daily Reporter';

function buildDailyReportInstruction(rangeLabel = '今天'): string {
  return `请生成工作日报，时间范围：${rangeLabel}`;
}

function parseDailyReportCommand(rawInput: string): string | null {
  const text = rawInput.trim();
  const match = text.match(/^(?:\/日报|@日报|\/daily-report|@Daily Reporter)(?:\s+(.+))?$/i);
  if (!match) return null;

  const rangeText = (match[1] || '').trim();
  if (!rangeText) return buildDailyReportInstruction();

  const aliases: Record<string, string> = {
    today: '今天',
    '今天': '今天',
    yesterday: '昨天',
    '昨天': '昨天',
    '前天': '前天',
    week: '本周',
    '本周': '本周',
    '这周': '本周',
  };

  return buildDailyReportInstruction(aliases[rangeText] || rangeText);
}

function compactDetail(value: unknown, maxLength = 220): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
}

function formatExecutionStep(log: any, index: number): ExecutionStep | null {
  const data = log.data || {};
  const id = `${log.timestamp || Date.now()}-${log.type}-${index}`;
  const timestamp = log.timestamp || Date.now();

  if (log.type === 'request') {
    return {
      id,
      type: 'request',
      timestamp,
      title: `请求模型 ${data.model || ''}`.trim(),
      detail: data.tools?.length ? `可用工具：${data.tools.join(', ')}` : `消息数：${data.messages?.length || 0}`,
      status: 'active',
    };
  }

  if (log.type === 'tool') {
    const completed = Boolean(data.duration);
    return {
      id,
      type: 'tool',
      timestamp,
      title: completed ? `工具完成：${data.toolName}` : `调用工具：${data.toolName}`,
      detail: completed
        ? compactDetail(data.toolResult || data.content)
        : compactDetail(data.toolArgs || data.content),
      status: completed ? 'done' : 'active',
    };
  }

  if (log.type === 'response') {
    return {
      id,
      type: 'response',
      timestamp,
      title: data.tools?.length ? `模型选择工具：${data.tools.join(', ')}` : '模型返回结果',
      detail: compactDetail(data.content || data.usage),
      status: 'done',
    };
  }

  if (log.type === 'chunk') {
    const content = compactDetail(data.content, 120);
    if (!content) return null;
    return {
      id,
      type: 'chunk',
      timestamp,
      title: '接收模型输出',
      detail: content,
      status: 'active',
    };
  }

  if (log.type === 'error') {
    return {
      id,
      type: 'error',
      timestamp,
      title: '执行出错',
      detail: compactDetail(data.error || data.content),
      status: 'error',
    };
  }

  return null;
}

function ExecutionDetails({
  steps,
  collapsed,
  finished,
  onToggle,
}: {
  steps: ExecutionStep[];
  collapsed: boolean;
  finished: boolean;
  onToggle: () => void;
}) {
  const visibleSteps = steps.slice(-24);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (collapsed) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [visibleSteps, collapsed]);

  if (visibleSteps.length === 0) {
    return null;
  }

  const iconFor = (step: ExecutionStep) => {
    if (step.status === 'error') return <AlertCircle size={14} />;
    if (step.type === 'tool') return <Wrench size={14} />;
    if (step.type === 'chunk') return <Radio size={14} />;
    if (step.status === 'done') return <CheckCircle2 size={14} />;
    return <Brain size={14} />;
  };

  return (
    <div className="w-full rounded-xl border border-border/70 bg-background/80 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 border-b border-border/70 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium min-w-0">
          <Brain size={15} className={cn(finished ? 'text-emerald-500' : 'text-primary')} />
          <span>{finished ? '执行记录' : '执行中'}</span>
          <span className="text-[11px] text-muted-foreground">{visibleSteps.length} steps</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!finished && (
            <span className="inline-flex items-center gap-1 text-[11px] text-primary">
              <Sparkles size={12} className="animate-pulse" />
              Running
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn('transition-transform duration-200', !collapsed && 'rotate-180')}
          />
        </div>
      </button>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="h-40 overflow-y-auto p-2 space-y-1.5 scroll-smooth"
        >
        {visibleSteps.map((step) => (
          <div
            key={step.id}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs animate-in fade-in slide-in-from-bottom-1 duration-200"
          >
            <div
              className={cn(
                'mt-0.5 shrink-0',
                step.status === 'error' ? 'text-destructive' :
                step.status === 'done' ? 'text-emerald-500' :
                'text-primary'
              )}
            >
              {iconFor(step)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{step.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {step.detail && (
                <div className="mt-0.5 text-muted-foreground break-words line-clamp-2">
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}

/** Parse thinking blocks from text, returning thinking content and the rest */
function parseThinking(text: string): { thinking: string | null; content: string } {
  // Match both `<think></think>` (DeepSeek) and `<think></think>` (Qwen) patterns
  const thinkOpenTags = ['<think>'];
  const thinkCloseTags = ['</think>'];

  for (let i = 0; i < thinkOpenTags.length; i++) {
    const open = thinkOpenTags[i];
    const close = thinkCloseTags[i];
    const startIdx = text.indexOf(open);
    if (startIdx === -1) continue;
    const endIdx = text.indexOf(close, startIdx + open.length);
    if (endIdx === -1) continue;
    const thinking = text.slice(startIdx + open.length, endIdx).trim();
    const after = text.slice(endIdx + close.length).trim();
    return { thinking, content: after };
  }
  return { thinking: null, content: text };
}

/** Single message bubble — extracted so we can memo the thinking parse */
function MessageBubble({ message }: { message: Message }) {
  const { thinking, content } = useMemo(() => parseThinking(message.content), [message.content]);
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300', isUser ? 'flex-row-reverse' : '')}>
      <div className={cn('p-2 rounded-xl transition-colors', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      <div
        className={cn(
          'max-w-[85%] p-4 rounded-2xl shadow-sm transition-all',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/80 border border-border/60'
        )}
      >
        {/* Thinking chain — collapsible */}
        {thinking && (
          <details className="mb-3 group">
            <summary className="flex items-center gap-1 cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
              <span className="font-medium">Thinking...</span>
            </summary>
            <div className="mt-2 pl-3 border-l-2 border-border text-sm text-muted-foreground whitespace-pre-wrap">
              {thinking}
            </div>
          </details>
        )}

        {/* Main content */}
        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="markdown prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

interface AgentChatProps {
  launchRequest?: ChatLaunchRequest | null;
  onLaunchHandled?: () => void;
}

export default function AgentChat({ launchRequest, onLaunchHandled }: AgentChatProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState>({
    steps: [],
    collapsed: false,
    finished: false,
  });
  const activeConversationRef = useRef<string | null>(null);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizeMessages = (items: any[]): Message[] =>
    items.filter((m: any) => m.role !== 'system');

  const loadConversationMessages = async (conversationId: string): Promise<Message[]> => {
    const msgs = await window.electronAPI.conversations.messages(conversationId);
    return normalizeMessages(msgs);
  };

  const getLatestConversations = async (): Promise<Conversation[]> => {
    const result = await window.electronAPI.conversations.list();
    setConversations(result);
    return result;
  };

  useEffect(() => {
    loadAgents();
    loadConversations();
    loadProviders();
    loadPromptTemplates();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, executionState.steps.length, executionState.collapsed, isLoading]);

  useEffect(() => {
    const remove = window.electronAPI.debug?.onModelCall((data) => {
      if (data.conversationId && data.conversationId !== activeConversationRef.current) {
        return;
      }

      setExecutionState(prev => {
        const step = formatExecutionStep(data, prev.steps.length);
        if (!step) return prev;
        return {
          ...prev,
          steps: [...prev.steps.slice(-39), step],
        };
      });
    });
    return () => remove?.();
  }, []);

  const sendConversationMessage = async ({
    agentId,
    message,
    model,
    resetMessages = false,
    forceNewConversation = false,
    reuseAgentConversation = false,
  }: {
    agentId: string;
    message: string;
    model?: string;
    resetMessages?: boolean;
    forceNewConversation?: boolean;
    reuseAgentConversation?: boolean;
  }) => {
    if (isLoading) return;

    let convId = forceNewConversation || reuseAgentConversation ? null : currentConversationId;
    let baseMessages: Message[] | null = null;

    if (!forceNewConversation && reuseAgentConversation) {
      try {
        const latest = await getLatestConversations();
        const reusable = latest.find((conv) => conv.agentId === agentId);
        if (reusable) {
          convId = reusable.id;
          if (currentConversationId !== reusable.id) {
            baseMessages = await loadConversationMessages(reusable.id);
          }
          setCurrentConversationId(reusable.id);
        }
      } catch (error) {
        console.error('Failed to find reusable conversation:', error);
      }

      if (!convId && currentConversationId && selectedAgentId === agentId && messages.length === 0) {
        convId = currentConversationId;
        baseMessages = [];
      }
    }

    if (!convId) {
      try {
        const conv = await window.electronAPI.conversations.create();
        convId = conv.id;
        setConversations(prev => [conv, ...prev]);
        setCurrentConversationId(convId);
        baseMessages = [];
      } catch (error) {
        console.error('Failed to create conversation:', error);
        return;
      }
    }

    setSelectedAgentId(agentId);
    if (model) {
      setSelectedModel(model);
    }
    activeConversationRef.current = convId;
    setExecutionState({
      steps: [
        {
          id: `start-${Date.now()}`,
          type: 'request',
          timestamp: Date.now(),
          title: '准备发送消息',
          detail: `Agent: ${agents.find(a => a.id === agentId)?.name || agentId}`,
          status: 'active',
        },
      ],
      collapsed: false,
      finished: false,
    });

    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => {
      if (resetMessages) return [userMessage, assistantMessage];
      const base = baseMessages !== null ? baseMessages : prev;
      return [...base, userMessage, assistantMessage];
    });
    setInput('');
    setIsLoading(true);

    const removeChunk = window.electronAPI.conversations.onStreamChunk((data) => {
      if (data.conversationId !== convId) return;
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: last.content + data.content };
        }
        return updated;
      });
    });

    const removeEnd = window.electronAPI.conversations.onStreamEnd((data) => {
      removeChunk();
      removeEnd();
      removeError();
      if (data.conversationId !== convId) return;
      setIsLoading(false);
      setExecutionState(prev => ({
        ...prev,
        finished: true,
        steps: [
          ...prev.steps,
          {
            id: `done-${Date.now()}`,
            type: 'response',
            timestamp: Date.now(),
            title: '回复完成',
            detail: data.usage ? compactDetail(data.usage) : undefined,
            status: 'done',
          },
        ],
      }));
      activeConversationRef.current = null;
      loadConversations();
    });

    const removeError = window.electronAPI.conversations.onStreamError((data) => {
      removeChunk();
      removeEnd();
      removeError();
      if (data.conversationId !== convId) return;
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content.startsWith('Error:')) {
          updated[updated.length - 1] = {
            ...last,
            content: last.content ? `${last.content}\n\nError: ${data.error}` : `Error: ${data.error}`,
          };
        }
        return updated;
      });
      setIsLoading(false);
      setExecutionState(prev => ({
        ...prev,
        finished: true,
        collapsed: false,
        steps: [
          ...prev.steps,
          {
            id: `error-${Date.now()}`,
            type: 'error',
            timestamp: Date.now(),
            title: '回复失败',
            detail: data.error,
            status: 'error',
          },
        ],
      }));
      activeConversationRef.current = null;
    });

    if (!convId) return;
    window.electronAPI.conversations.chat(convId, agentId, message, model || selectedModel || undefined);
  };

  const loadAgents = async () => {
    try {
      const result = await window.electronAPI.agents.list();
      setAgents(result);
      if (result.length > 0 && !selectedAgentId) {
        setSelectedAgentId(result[0].id);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const loadProviders = async () => {
    try {
      const result = await window.electronAPI.llm.listProviders();
      const enabledProviders = result.filter((p: LLMProvider) => p.enabled);
      setProviders(enabledProviders);
      // Set default model to first enabled provider's first enabled model
      if (enabledProviders.length > 0 && !selectedModel) {
        const firstEnabled = enabledProviders.find(p => (p.enabledModels || []).length > 0);
        if (firstEnabled) {
          setSelectedModel(firstEnabled.enabledModels[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

  const loadPromptTemplates = async () => {
    try {
      const result = await window.electronAPI.prompts.list();
      setPromptTemplates(result || []);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    }
  };

  const loadConversations = async () => {
    try {
      await getLatestConversations();
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const handleNewConversation = async () => {
    try {
      const conv = await window.electronAPI.conversations.create();
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(conv.id);
      setMessages([]);
      setExecutionState({ steps: [], collapsed: false, finished: false });
      activeConversationRef.current = null;
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const prepareDraftConversation = async (
    agentId: string,
    forceNewConversation?: boolean,
    reuseAgentConversation?: boolean
  ) => {
    setSelectedAgentId(agentId);

    if (!forceNewConversation && !reuseAgentConversation && currentConversationId) {
      return;
    }

    try {
      if (!forceNewConversation && reuseAgentConversation) {
        const latest = await getLatestConversations();
        const reusable = latest.find((conv) => conv.agentId === agentId);
        if (reusable) {
          setCurrentConversationId(reusable.id);
          setMessages(await loadConversationMessages(reusable.id));
          setExecutionState({ steps: [], collapsed: false, finished: false });
          activeConversationRef.current = null;
          return;
        }

        if (currentConversationId && selectedAgentId === agentId && messages.length === 0) {
          setMessages([]);
          return;
        }
      }

      const conv = await window.electronAPI.conversations.create();
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(conv.id);
      setMessages([]);
      setExecutionState({ steps: [], collapsed: false, finished: false });
      activeConversationRef.current = null;
    } catch (error) {
      console.error('Failed to create draft conversation:', error);
    }
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    setExecutionState({ steps: [], collapsed: false, finished: false });
    activeConversationRef.current = null;
    if (conv.agentId) {
      setSelectedAgentId(conv.agentId);
    }
    try {
      setMessages(await loadConversationMessages(conv.id));
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (conv) {
      setDeleteTarget(conv);
      setDeleteDialogOpen(true);
    }
  };

  const confirmDeleteConversation = async () => {
    if (!deleteTarget) return;
    try {
      await window.electronAPI.conversations.delete(deleteTarget.id);
      setConversations(prev => prev.filter(c => c.id !== deleteTarget.id));
      if (currentConversationId === deleteTarget.id) {
        setCurrentConversationId(null);
        setMessages([]);
        setExecutionState({ steps: [], collapsed: false, finished: false });
        activeConversationRef.current = null;
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const handleRenameConversation = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await window.electronAPI.conversations.rename(renameTarget.id, renameValue.trim());
      setConversations(prev =>
        prev.map(c => c.id === renameTarget.id ? { ...c, title: renameValue.trim() } : c)
      );
      setRenameDialogOpen(false);
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedAgentId || isLoading) return;

    const dailyReportMessage = parseDailyReportCommand(input);
    if (dailyReportMessage) {
      const dailyReporter = agents.find(a => a.name === DAILY_REPORT_AGENT_NAME);
      if (dailyReporter) {
        await sendConversationMessage({
          agentId: dailyReporter.id,
          message: dailyReportMessage,
          model: selectedModel || undefined,
          reuseAgentConversation: true,
        });
        return;
      }
    }

    await sendConversationMessage({
      agentId: selectedAgentId,
      message: input,
      model: selectedModel || undefined,
    });
  };

  const handleAbortChat = () => {
    if (!currentConversationId) return;
    window.electronAPI.conversations.abort(currentConversationId);
    setIsLoading(false);
    setExecutionState(prev => ({
      ...prev,
      finished: true,
      steps: [
        ...prev.steps,
        {
          id: `abort-${Date.now()}`,
          type: 'error',
          timestamp: Date.now(),
          title: '已终止生成',
          status: 'error',
        },
      ],
    }));
    activeConversationRef.current = null;
  };

  const slashQuery = input.startsWith('/') ? input.slice(1).trim().toLowerCase() : null;
  const promptSuggestions = useMemo<PromptSuggestion[]>(() => {
    if (slashQuery === null) return [];

    const builtins: PromptSuggestion[] = [
      {
        id: 'builtin-daily-report',
        name: '生成日报',
        trigger: '日报',
        description: '复用 Daily Reporter 会话生成工作日报',
        content: '/日报',
        type: 'builtin',
      },
    ];

    const userPrompts = promptTemplates
      .filter((prompt) => prompt.enabled)
      .map<PromptSuggestion>((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        trigger: prompt.trigger,
        description: prompt.description,
        content: prompt.content,
        type: 'prompt',
      }));

    const all = [...builtins, ...userPrompts];
    if (!slashQuery) return all.slice(0, 8);

    return all
      .filter((item) => {
        const haystack = `${item.name} ${item.trigger} ${item.description}`.toLowerCase();
        return haystack.includes(slashQuery);
      })
      .slice(0, 8);
  }, [promptTemplates, slashQuery]);

  const promptMenuOpen = slashQuery !== null && promptSuggestions.length > 0 && !isLoading;

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [slashQuery]);

  const applyPromptSuggestion = (suggestion: PromptSuggestion) => {
    setInput(suggestion.content);
    setSelectedPromptIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!launchRequest || agents.length === 0 || isLoading) return;

    const agent = agents.find(a => a.name === launchRequest.agentName);
    if (!agent) {
      console.error(`Agent not found for launch request: ${launchRequest.agentName}`);
      onLaunchHandled?.();
      return;
    }

    onLaunchHandled?.();
    if (launchRequest.autoSend === false) {
      setInput(launchRequest.message);
      if (launchRequest.model) {
        setSelectedModel(launchRequest.model);
      }
      void prepareDraftConversation(
        agent.id,
        launchRequest.newConversation,
        launchRequest.reuseAgentConversation ?? agent.name === DAILY_REPORT_AGENT_NAME
      );
      return;
    }

    void sendConversationMessage({
      agentId: agent.id,
      message: launchRequest.message,
      model: launchRequest.model,
      resetMessages: launchRequest.newConversation === true,
      forceNewConversation: launchRequest.newConversation,
      reuseAgentConversation: launchRequest.reuseAgentConversation ?? agent.name === DAILY_REPORT_AGENT_NAME,
    });
  }, [agents, isLoading, launchRequest, onLaunchHandled]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (promptMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedPromptIndex((index) => (index + 1) % promptSuggestions.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedPromptIndex((index) => (index - 1 + promptSuggestions.length) % promptSuggestions.length);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        applyPromptSuggestion(promptSuggestions[selectedPromptIndex]);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="h-full flex">
      {/* Conversation Sidebar */}
      <div className="w-64 bg-background border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <Button onClick={handleNewConversation} className="w-full" size="sm">
            <Plus size={16} className="mr-2" />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={cn(
                  'group flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm transition-colors',
                  currentConversationId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                )}
              >
                <MessageSquare size={14} className="shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm leading-snug line-clamp-2">{conv.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {conv.updatedAt ? new Date(conv.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setRenameTarget(conv);
                      setRenameValue(conv.title);
                      setRenameDialogOpen(true);
                    }}>
                      <Pencil size={14} className="mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}>
                      <Trash2 size={14} className="mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with agent selector */}
        <div className="p-4 border-b border-border bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot size={24} className="text-primary" />
              {selectedAgent ? (
                <div>
                  <h3 className="font-semibold">{selectedAgent.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedAgent.description}</p>
                </div>
              ) : (
                <div>
                  <h3 className="font-semibold">Select an agent</h3>
                  <p className="text-sm text-muted-foreground">Choose an agent to start chatting</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <Separator />

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Bot size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Start a conversation with {selectedAgent?.name || 'an agent'}</p>
                </div>
              </div>
            ) : (
              messages.map((message, index) => {
                const isLoadingAssistant = isLoading && index === messages.length - 1 && message.role === 'assistant' && message.content === '';
                if (isLoadingAssistant) return null;
                return <MessageBubble key={index} message={message} />;
              })
            )}
            {executionState.steps.length > 0 && (
              <div className="ml-11 max-w-[85%]">
                <ExecutionDetails
                  steps={executionState.steps}
                  collapsed={executionState.collapsed}
                  finished={executionState.finished}
                  onToggle={() => setExecutionState((prev) => ({ ...prev, collapsed: !prev.collapsed }))}
                />
              </div>
            )}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Bot size={20} />
                  </div>
                  <div className="bg-muted/80 border border-border/60 px-4 py-2 rounded-2xl shadow-sm animate-in fade-in duration-200">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                    </div>
                  </div>
                </div>
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        {selectedAgentId && (
          <>
            <Separator />
            <div className="p-4 bg-background">
              {/* Compact controls above the message input */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground">
                  <Cpu size={12} />
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-transparent border-none text-xs text-muted-foreground cursor-pointer focus:outline-none"
                  >
                    {providers.map((provider) =>
                      (provider.enabledModels || []).map((model) => (
                        <option key={`${provider.id}-${model}`} value={model}>
                          {model}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={selectedAgent ? `Agent: ${selectedAgent.name}` : 'Agent'}
                    >
                      <Bot size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {agents.map((agent) => (
                      <DropdownMenuItem
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                      >
                        {agent.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="日报"
                  onClick={() => setInput('/日报')}
                  disabled={isLoading}
                >
                  <FileText size={14} />
                </Button>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 shadow-sm p-3 transition-all focus-within:border-primary/50 focus-within:shadow-md">
                <div className="relative flex gap-3">
                  {promptMenuOpen && (
                    <div className="absolute left-0 right-14 bottom-full mb-3 rounded-xl border border-border/70 bg-popover/95 backdrop-blur text-popover-foreground shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      {promptSuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className={cn(
                            'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
                            index === selectedPromptIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                          )}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyPromptSuggestion(suggestion);
                          }}
                        >
                          <FileText size={15} className="mt-0.5 text-muted-foreground shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{suggestion.name}</span>
                              <span className="font-mono text-[11px] text-muted-foreground shrink-0">/{suggestion.trigger}</span>
                            </span>
                            {suggestion.description && (
                              <span className="block text-xs text-muted-foreground truncate mt-0.5">
                                {suggestion.description}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={`Message ${selectedAgent?.name || 'agent'}${selectedModel ? ` (${selectedModel})` : ''}...`}
                    disabled={isLoading}
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 text-[15px]"
                  />
                  {isLoading ? (
                    <Button
                      onClick={handleAbortChat}
                      size="icon"
                      variant="destructive"
                      className="h-10 w-10 rounded-xl shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      title="终止生成"
                    >
                      <Square size={16} />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSendMessage}
                      disabled={!input.trim()}
                      size="icon"
                      className="h-10 w-10 rounded-xl shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Send size={18} />
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">按 Enter 发送，输入 / 唤起提示词</span>
                  <span>{selectedModel || 'No model'}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConversation();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameConversation}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteConversation}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
