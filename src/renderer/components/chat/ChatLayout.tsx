import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Cpu, X, Square } from 'lucide-react';
import type { MemorySuggestionEvent } from './assistant-ui/useIpcChatRuntime';
import type { QuickAction } from '../assistant-ui/thread';
import MemorySuggestCard from './MemorySuggestCard';
import { useChatConversations } from './hooks/useChatConversations';
import { useExecutionState } from './hooks/useExecutionState';
import { useSlashCommands } from './hooks/useSlashCommands';
import ConversationList from './ConversationList';
import ChatHeader from './ChatHeader';
import { AssistantThread } from './assistant-ui/AssistantThread';
import ExecutionDetails from './ExecutionDetails';
import { useIpcChatRuntime } from './assistant-ui/useIpcChatRuntime';
import { ToolApprovalProvider } from './assistant-ui/tool-approval-context';
import { AssistantTheme } from './assistant-ui/AssistantTheme';
import { appendStreamText, appendStreamError, createEmptyAssistantMessage } from './assistant-ui/messageAdapter';
import type { LLMProvider, Conversation, Message } from './types';
import type { PromptTemplate } from '../../../shared/types';

interface ChatLayoutProps {
  launchRequest?: any | null;
  onLaunchHandled?: () => void;
}

export default function ChatLayout({ launchRequest, onLaunchHandled }: ChatLayoutProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);

  // Custom resizable panel
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Conversation list management ---
  const {
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    activeConversationRef,
    loadConversations,
    loadConversationMessages,
    handleNewConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useChatConversations();

  // --- Execution state (debug panel) ---
  const { executionState, toggleCollapsed, resetExecution } = useExecutionState(activeConversationRef);

  // --- Chat state managed locally (fed to both IPC runtime and legacy paths) ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSkills, setActiveSkills] = useState<Map<string, string[]>>(new Map());

  // --- Memory suggestion state ---
  const [pendingMemorySuggestion, setPendingMemorySuggestion] = useState<MemorySuggestionEvent | null>(null);

  const handleMemorySuggestion = useCallback((suggestion: MemorySuggestionEvent) => {
    setPendingMemorySuggestion(suggestion);
  }, []);

  const handleMemoryConfirm = useCallback(async (data: { content: string; category: string }) => {
    try {
      await window.electronAPI.memories.create({ content: data.content, category: data.category, source: 'agent_suggested' });
    } catch (error) {
      console.error('Failed to save memory:', error);
    }
    setPendingMemorySuggestion(null);
  }, []);

  const handleMemoryDismiss = useCallback(() => {
    setPendingMemorySuggestion(null);
  }, []);

  // --- Skill management ---
  const activateSkill = useCallback((convId: string, skillId: string) => {
    setActiveSkills(prev => {
      const next = new Map(prev);
      const existing = next.get(convId) || [];
      if (!existing.includes(skillId)) {
        next.set(convId, [...existing, skillId]);
      }
      return next;
    });
  }, []);

  const deactivateSkill = useCallback((convId: string, skillId: string) => {
    setActiveSkills(prev => {
      const next = new Map(prev);
      const existing = next.get(convId) || [];
      next.set(convId, existing.filter(id => id !== skillId));
      return next;
    });
  }, []);

  const getActiveSkills = useCallback((convId: string) => {
    return activeSkills.get(convId) || [];
  }, [activeSkills]);

  // --- Programmatic send (for launch requests & skill auto-messages) ---
  const sendProgrammaticMessage = useCallback(async ({
    message,
    model,
    extraSkillIds,
  }: {
    message: string;
    model?: string;
    extraSkillIds?: string[];
  }) => {
    if (isLoading) return;

    let convId: string | null = currentConversationId;
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

    activeConversationRef.current = convId;

    const userMsg: Message = { role: 'user', content: message, timestamp: new Date().toISOString() };
    const assistantMsg = createEmptyAssistantMessage();
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    const removeChunk = window.electronAPI.conversations.onStreamChunk((data) => {
      if (data.conversationId !== convId) return;
      setMessages(prev => appendStreamText(prev, data.content));
    });

    const removeEnd = window.electronAPI.conversations.onStreamEnd((data) => {
      removeChunk(); removeEnd(); removeError(); removeToolEvent();
      if (data.conversationId !== convId) return;
      setIsLoading(false);
      activeConversationRef.current = null;
      loadConversations();
    });

    const removeError = window.electronAPI.conversations.onStreamError((data) => {
      removeChunk(); removeEnd(); removeError(); removeToolEvent();
      if (data.conversationId !== convId) return;
      setMessages(prev => appendStreamError(prev, data.error));
      setIsLoading(false);
      activeConversationRef.current = null;
    });

    const removeToolEvent = window.electronAPI.conversations.onStreamToolEvent(() => {});

    const stateSkillIds = activeSkills.get(convId!) || [];
    const merged = extraSkillIds?.length
      ? [...new Set([...stateSkillIds, ...extraSkillIds])]
      : stateSkillIds;

    window.electronAPI.conversations.chat(
      convId!, null, message, model || selectedModel || undefined,
      merged.length > 0 ? merged : undefined,
    );
  }, [isLoading, currentConversationId, selectedModel, activeSkills, setConversations, setCurrentConversationId, activeConversationRef, loadConversations]);

  const handleActivateSkill = useCallback(async (skillId: string, autoMessage?: string) => {
    // Handle prompt injections (prefixed with __prompt__)
    if (skillId.startsWith('__prompt__')) {
      if (!autoMessage) return;
      await sendProgrammaticMessage({ message: autoMessage, model: selectedModel || undefined });
      return;
    }

    let convId = currentConversationId;
    if (!convId) {
      const conv = await window.electronAPI.conversations.create();
      convId = conv.id;
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(convId);
    }
    activateSkill(convId!, skillId);
    if (autoMessage) {
      await sendProgrammaticMessage({
        message: autoMessage,
        model: selectedModel || undefined,
        extraSkillIds: [skillId],
      });
    }
  }, [currentConversationId, activateSkill, setConversations, setCurrentConversationId, sendProgrammaticMessage, selectedModel]);

  // --- Quick actions (daily/weekly report shortcuts) ---
  const quickActions: QuickAction[] = useMemo(() => [
    {
      id: 'daily-report',
      label: '日报',
      onClick: () => sendProgrammaticMessage({
        message: '生成今天的工作日报',
        model: selectedModel || undefined,
        extraSkillIds: ['builtin-daily-reporter'],
      }),
    },
    {
      id: 'weekly-report',
      label: '周报',
      onClick: () => sendProgrammaticMessage({
        message: '生成本周的工作周报',
        model: selectedModel || undefined,
        extraSkillIds: ['builtin-weekly-reporter'],
      }),
    },
  ], [sendProgrammaticMessage, selectedModel]);

  // --- Slash commands (skills + prompt templates) ---
  const {
    commands,
    pendingVariablePrompt,
    pendingParameterSkill,
    applyVariableValues,
    cancelVariableFill,
    applySkillParameters,
    cancelSkillParameters,
    skills: availableSkills,
  } = useSlashCommands(promptTemplates, {
    onActivateSkill: handleActivateSkill,
    onPendingVariablePrompt: () => {},
    onPendingParameterSkill: () => {},
  });

  const activeSkillBadges = (currentConversationId ? getActiveSkills(currentConversationId) : [])
    .map(id => {
      const skill = availableSkills.find((s: any) => s.id === id);
      return skill ? { id: skill.id, name: skill.name } : { id, name: id };
    });

  const handleRemoveSkill = useCallback((skillId: string) => {
    if (currentConversationId) {
      deactivateSkill(currentConversationId, skillId);
    }
  }, [currentConversationId, deactivateSkill]);

  // --- Assistant-ui runtime ---
  const activeSkillIds = currentConversationId ? getActiveSkills(currentConversationId) : [];

  const { runtime, respondApproval, pendingApprovals } = useIpcChatRuntime({
    conversationId: currentConversationId,
    setConversationId: setCurrentConversationId,
    messages,
    setMessages,
    isRunning: isLoading,
    setIsRunning: setIsLoading,
    selectedModel,
    activeSkillIds,
    onMemorySuggestion: handleMemorySuggestion,
  });

  // --- Load initial data ---
  useEffect(() => {
    loadConversations();
    loadProviders();
    loadPromptTemplates();
  }, []);

  // Persist model selection
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem('selectedModel', selectedModel);
    }
  }, [selectedModel]);

  const loadProviders = async () => {
    try {
      const result = await window.electronAPI.llm.listProviders();
      const enabledProviders = result.filter((p: LLMProvider) => p.enabled);
      setProviders(enabledProviders);

      const savedModel = localStorage.getItem('selectedModel');
      if (savedModel && enabledProviders.some((p: LLMProvider) => (p.enabledModels || []).includes(savedModel))) {
        setSelectedModel(savedModel);
      } else if (enabledProviders.length > 0 && !selectedModel) {
        const firstEnabled = enabledProviders.find((p: LLMProvider) => (p.enabledModels || []).length > 0);
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

  // --- Conversation selection ---
  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    resetExecution();
    activeConversationRef.current = null;
    try {
      setMessages(await loadConversationMessages(conv.id));
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    }
  }, [setCurrentConversationId, resetExecution, activeConversationRef, setMessages, loadConversationMessages]);

  const handleNewConv = useCallback(async () => {
    const conv = await handleNewConversation();
    if (conv) {
      setMessages([]);
      resetExecution();
    }
  }, [handleNewConversation, setMessages, resetExecution]);

  // --- Handle launch request ---
  useEffect(() => {
    if (!launchRequest || isLoading) return;
    onLaunchHandled?.();

    if (launchRequest.autoSend === false) {
      // TODO: inject text into assistant-ui composer
      return;
    }

    void sendProgrammaticMessage({
      message: launchRequest.message,
      model: launchRequest.model,
    });
  }, [isLoading, launchRequest, onLaunchHandled]);

  // --- Resize handle logic ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      const minWidth = 200;
      const maxWidth = containerRect.width * 0.45;
      setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full flex">
      {/* Conversation list panel */}
      <div
        className="h-full flex-shrink-0 overflow-hidden border-r border-[hsl(var(--border))]"
        style={{ width: sidebarWidth }}
      >
        <ConversationList
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConv}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
        />
      </div>

      {/* Resize handle */}
      <div
        className="w-1 h-full flex-shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Chat main panel - wrapped with assistant-ui runtime */}
      <AssistantRuntimeProvider runtime={runtime}>
        <ToolApprovalProvider value={{ pendingApprovals, respondApproval }}>
        <div className="flex-1 h-full flex flex-col min-w-0">
          <ChatHeader />

          <AssistantTheme>
            {/* Model selector + skill badges */}
            <div className="px-4 py-1.5 flex items-center gap-2 border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-xs text-muted-foreground">
                <Cpu size={12} />
                <select
                  value={selectedModel || ''}
                  onChange={(e) => setSelectedModel(e.target.value || null)}
                  className="bg-transparent border-none text-xs text-muted-foreground cursor-pointer focus:outline-none"
                >
                  <option value="">Default</option>
                  {providers.map((provider) =>
                    (provider.enabledModels || []).map((model) => (
                      <option key={`${provider.id}-${model}`} value={model}>
                        {model}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {activeSkillBadges.map((skill) => (
                <span
                  key={skill.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
                >
                  {skill.name}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill.id)}
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-primary/20 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>

            {/* Thread (messages + empty state + composer with slash commands) */}
            <div className="flex-1 min-h-0">
              <AssistantThread
                commands={commands}
                quickActions={quickActions}
                pendingParameterSkill={pendingParameterSkill}
                pendingVariablePrompt={pendingVariablePrompt}
                onApplySkillParameters={applySkillParameters}
                onCancelSkillParameters={cancelSkillParameters}
                onApplyVariableValues={applyVariableValues}
                onCancelVariableFill={cancelVariableFill}
              />
            </div>

            {/* Memory suggestion card */}
            {pendingMemorySuggestion && (
              <div className="px-4 pb-2">
                <MemorySuggestCard
                  suggestion={pendingMemorySuggestion}
                  onConfirm={handleMemoryConfirm}
                  onDismiss={handleMemoryDismiss}
                />
              </div>
            )}

            {/* Execution debug panel */}
            {executionState.steps.length > 0 && (
              <div className="px-4 pb-2">
                <ExecutionDetails
                  steps={executionState.steps}
                  collapsed={executionState.collapsed}
                  finished={executionState.finished}
                  onToggle={toggleCollapsed}
                />
              </div>
            )}

            {/* Agent status bar */}
            {isLoading && !executionState.finished && (
              <div className="h-10 px-4 flex items-center justify-between bg-muted/50 border-t border-[hsl(var(--border))]">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm text-muted-foreground">
                    {executionState.steps.length > 0
                      ? (() => {
                          const last = executionState.steps[executionState.steps.length - 1];
                          if (last.type === 'tool' && last.status === 'active') return `Using tool: ${last.title.replace(/^调用工具：/, '')}`;
                          if (last.type === 'chunk') return 'Generating...';
                          if (last.type === 'request') return 'Thinking...';
                          return 'Processing...';
                        })()
                      : 'Thinking...'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { if (currentConversationId) window.electronAPI.conversations.abort(currentConversationId); }}
                  className="h-7 px-3 flex items-center gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                >
                  <Square size={12} />
                  Stop
                </button>
              </div>
            )}
          </AssistantTheme>
        </div>
        </ToolApprovalProvider>
      </AssistantRuntimeProvider>
    </div>
  );
}
