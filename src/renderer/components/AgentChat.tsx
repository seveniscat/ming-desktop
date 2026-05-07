import { useState, useEffect, useRef, useMemo } from 'react';
import { Send, Bot, User, Plus, Trash2, MessageSquare, Pencil, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
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

/** Parse <think&gt;...&lt;/think&gt; blocks from text, returning thinking content and the rest */
function parseThinking(text: string): { thinking: string | null; content: string } {
  const match = text.match(/^<think\s*>([\s\S]*?)<\/think>\s*\n?/);
  if (!match) return { thinking: null, content: text };
  return { thinking: match[1].trim(), content: text.slice(match[0].length) };
}

/** Single message bubble — extracted so we can memo the thinking parse */
function MessageBubble({ message }: { message: Message }) {
  const { thinking, content } = useMemo(() => parseThinking(message.content), [message.content]);
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-3', isUser ? 'flex-row-reverse' : '')}>
      <div className={cn('p-2 rounded-lg', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      <div
        className={cn(
          'max-w-2xl p-4 rounded-lg',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
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
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <code
                        className={className}
                        dangerouslySetInnerHTML={{
                          __html: hljs.highlight(codeStr, { language: match[1] }).value,
                        }}
                      />
                    );
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentChat() {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAgents();
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const loadConversations = async () => {
    try {
      const result = await window.electronAPI.conversations.list();
      setConversations(result);
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
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    if (conv.agentId) {
      setSelectedAgentId(conv.agentId);
    }
    try {
      const msgs = await window.electronAPI.conversations.messages(conv.id);
      setMessages(msgs.filter((m: any) => m.role !== 'system'));
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await window.electronAPI.conversations.delete(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (currentConversationId === convId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
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

    // Auto-create conversation if none selected
    let convId = currentConversationId;
    if (!convId) {
      try {
        const conv = await window.electronAPI.conversations.create();
        convId = conv.id;
        setConversations(prev => [conv, ...prev]);
        setCurrentConversationId(convId);
      } catch (error) {
        console.error('Failed to create conversation:', error);
        return;
      }
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await window.electronAPI.conversations.chat(convId!, selectedAgentId, input);
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMessage]);
      // Refresh conversation list to get updated title/timestamp
      loadConversations();
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
                <span className="flex-1 truncate">{conv.title}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
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
            <div className="flex items-center gap-2">
              <select
                value={selectedAgentId || ''}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="text-sm border border-border rounded-md px-3 py-1.5 bg-background"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
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
              messages.map((message, index) => (
                <MessageBubble key={index} message={message} />
              ))
            )}
            {isLoading && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Bot size={20} />
                </div>
                <div className="bg-muted px-4 py-2 rounded-lg">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        {selectedAgentId && (
          <>
            <Separator />
            <div className="p-4 bg-background">
              <div className="flex gap-3">
                <Input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message ${selectedAgent?.name || 'agent'}...`}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim()}
                  size="default"
                >
                  <Send size={18} />
                </Button>
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
    </div>
  );
}
