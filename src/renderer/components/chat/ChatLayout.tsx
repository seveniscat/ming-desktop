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
import type { LLMProvider, Conversation } from './types';
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
    selectedModel,
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

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    await sendConversationMessage({
      message: input,
      model: selectedModel || undefined,
    });
    setInput('');
  }, [input, isLoading, selectedModel, sendConversationMessage, setInput]);

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
    if (!launchRequest || isLoading) return;
    onLaunchHandled?.();

    if (launchRequest.autoSend === false) {
      setInput(launchRequest.message || '');
      return;
    }

    void sendConversationMessage({
      message: launchRequest.message,
      model: launchRequest.model,
    });
  }, [isLoading, launchRequest, onLaunchHandled]);

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
        <ChatHeader />

        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          executionState={executionState}
          selectedAgent={undefined}
          onToggleExecution={toggleCollapsed}
          onSuggestionClick={(text) => setInput(text)}
        />

        <AgentStatusBar
          executionState={executionState}
          isLoading={isLoading}
          onAbort={handleAbortChat}
        />

        <ChatInput
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          isLoading={isLoading}
          selectedAgent={undefined}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          agents={[]}
          setSelectedAgentId={() => {}}
          providers={providers}
          promptMenuOpen={promptMenuOpen}
          promptSuggestions={promptSuggestions}
          selectedPromptIndex={selectedPromptIndex}
          onSend={handleSendMessage}
          onAbort={handleAbortChat}
          onKeyDown={handleInputKeyDown}
          onApplyPromptSuggestion={applyPromptSuggestion}
        />
      </div>
    </div>
  );
}
