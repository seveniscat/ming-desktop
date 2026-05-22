import { useState, useEffect, useCallback, useRef } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatConversations } from './hooks/useChatConversations';
import { useChatInput } from './hooks/useChatInput';
import { useExecutionState } from './hooks/useExecutionState';
import ConversationList from './ConversationList';
import ChatHeader from './ChatHeader';
import VariableFillDialog from './VariableFillDialog';
import SkillParameterDialog from './SkillParameterDialog';
import { useIpcChatRuntime } from './assistant-ui/useIpcChatRuntime';
import { AssistantThread } from './assistant-ui/AssistantThread';
import { AssistantComposer } from './assistant-ui/AssistantComposer';
import { AssistantTheme } from './assistant-ui/AssistantTheme';
import { appendStreamText, appendStreamError, createEmptyAssistantMessage } from './assistant-ui/messageAdapter';
import type { LLMProvider, Conversation, Message } from './types';
import type { PromptTemplate } from '../../../shared/types';

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

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
  const { resetExecution } = useExecutionState(activeConversationRef);

  // --- Chat state managed locally (fed to both IPC runtime and legacy paths) ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSkills, setActiveSkills] = useState<Map<string, string[]>>(new Map());

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
  // This mirrors useIpcChatRuntime's onNew but is called imperatively,
  // avoiding double listener registration since the runtime only registers
  // listeners when the user sends via the assistant-ui composer.
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

  // --- Chat input (slash menu, prompt suggestions, variable fill, skill params) ---
  const {
    setInput,
    pendingVariablePrompt,
    applyVariableValues,
    cancelVariableFill,
    pendingParameterSkill,
    applySkillParameters,
    cancelSkillParameters,
    skills: availableSkills,
  } = useChatInput({ promptTemplates, isLoading, onActivateSkill: handleActivateSkill });

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

  const runtime = useIpcChatRuntime({
    conversationId: currentConversationId,
    setConversationId: setCurrentConversationId,
    messages,
    setMessages,
    isRunning: isLoading,
    setIsRunning: setIsLoading,
    selectedModel,
    activeSkillIds,
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
      setInput(launchRequest.message || '');
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
        <div className="flex-1 h-full flex flex-col min-w-0">
          <ChatHeader />

          <AssistantTheme>
            {/* Thread (messages + empty state) */}
            <div className="flex-1 min-h-0">
              <AssistantThread />
            </div>

            {/* Composer (model selector + skill badges + input) */}
            <AssistantComposer
              providers={providers}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              activeSkillBadges={activeSkillBadges}
              onRemoveSkill={handleRemoveSkill}
            />
          </AssistantTheme>
        </div>
      </AssistantRuntimeProvider>

      <VariableFillDialog
        open={!!pendingVariablePrompt}
        variables={pendingVariablePrompt ? extractVariables(pendingVariablePrompt.content) : []}
        onConfirm={applyVariableValues}
        onCancel={cancelVariableFill}
      />

      <SkillParameterDialog
        open={!!pendingParameterSkill}
        skillName={pendingParameterSkill?.skillName || ''}
        parameters={pendingParameterSkill?.parameters || []}
        onConfirm={applySkillParameters}
        onCancel={cancelSkillParameters}
      />
    </div>
  );
}
