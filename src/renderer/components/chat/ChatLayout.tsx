import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatConversations } from './hooks/useChatConversations';
import { useChatMessages } from './hooks/useChatMessages';
import { useChatInput } from './hooks/useChatInput';
import { useExecutionState } from './hooks/useExecutionState';
import ConversationList from './ConversationList';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import AgentStatusBar from './AgentStatusBar';
import type { Agent, LLMProvider, ChatLaunchRequest, Conversation } from './types';
import type { PromptTemplate } from '../../../shared/types';

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
    today: '今天', '今天': '今天',
    yesterday: '昨天', '昨天': '昨天', '前天': '前天',
    week: '本周', '本周': '本周', '这周': '本周',
  };

  return buildDailyReportInstruction(aliases[rangeText] || rangeText);
}

interface ChatLayoutProps {
  launchRequest?: ChatLaunchRequest | null;
  onLaunchHandled?: () => void;
}

export default function ChatLayout({ launchRequest, onLaunchHandled }: ChatLayoutProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);

  // Custom resizable panel
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversationId,
    activeConversationRef,
    loadConversations,
    loadConversationMessages,
    getLatestConversations,
    handleNewConversation,
    handleDeleteConversation,
    handleRenameConversation,
  } = useChatConversations();

  const { executionState, setExecutionState, toggleCollapsed, resetExecution } = useExecutionState(activeConversationRef);

  const {
    messages,
    setMessages,
    isLoading,
    sendConversationMessage,
    handleAbortChat,
  } = useChatMessages({
    currentConversationId,
    setCurrentConversationId,
    activeConversationRef,
    agents,
    selectedModel,
    setSelectedAgentId,
    setSelectedModel,
    setExecutionState,
    getLatestConversations,
    loadConversationMessages,
    setConversations,
    loadConversations,
  });

  const {
    input,
    setInput,
    inputRef,
    promptSuggestions,
    promptMenuOpen,
    selectedPromptIndex,
    setSelectedPromptIndex,
    applyPromptSuggestion,
  } = useChatInput({ promptTemplates, isLoading });

  // Load initial data
  useEffect(() => {
    loadAgents();
    loadConversations();
    loadProviders();
    loadPromptTemplates();
  }, []);

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

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    resetExecution();
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
  }, [setCurrentConversationId, resetExecution, activeConversationRef, setMessages, loadConversationMessages]);

  const handleNewConv = useCallback(async () => {
    const conv = await handleNewConversation();
    if (conv) {
      setMessages([]);
      resetExecution();
    }
  }, [handleNewConversation, setMessages, resetExecution]);

  const handleSendMessage = useCallback(async () => {
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
        setInput('');
        return;
      }
    }

    await sendConversationMessage({
      agentId: selectedAgentId,
      message: input,
      model: selectedModel || undefined,
    });
    setInput('');
  }, [input, selectedAgentId, isLoading, agents, selectedModel, sendConversationMessage, setInput]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (promptMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedPromptIndex((idx) => (idx + 1) % promptSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedPromptIndex((idx) => (idx - 1 + promptSuggestions.length) % promptSuggestions.length);
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
  }, [promptMenuOpen, promptSuggestions, selectedPromptIndex, setSelectedPromptIndex, applyPromptSuggestion, setInput, handleSendMessage]);

  // Handle launch request
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
      setSelectedAgentId(agent.id);
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

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  // Resize handle logic
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

      {/* Chat main panel */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        <ChatHeader selectedAgent={selectedAgent} />

        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          executionState={executionState}
          selectedAgent={selectedAgent}
          onToggleExecution={toggleCollapsed}
          onSuggestionClick={(text) => setInput(text)}
        />

        <AgentStatusBar
          executionState={executionState}
          isLoading={isLoading}
          onAbort={handleAbortChat}
        />

        {selectedAgentId && (
          <ChatInput
            input={input}
            setInput={setInput}
            inputRef={inputRef}
            isLoading={isLoading}
            selectedAgent={selectedAgent}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            agents={agents}
            setSelectedAgentId={setSelectedAgentId}
            providers={providers}
            promptMenuOpen={promptMenuOpen}
            promptSuggestions={promptSuggestions}
            selectedPromptIndex={selectedPromptIndex}
            onSend={handleSendMessage}
            onAbort={handleAbortChat}
            onKeyDown={handleInputKeyDown}
            onApplyPromptSuggestion={applyPromptSuggestion}
          />
        )}
      </div>
    </div>
  );
}
