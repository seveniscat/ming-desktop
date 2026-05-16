import { useState, useCallback, type MutableRefObject } from 'react';
import type { Message, ExecutionState } from '../types';

function compactDetail(value: unknown, maxLength = 220): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
}

interface SendMessageParams {
  message: string;
  model?: string;
  resetMessages?: boolean;
  forceNewConversation?: boolean;
}

export function useChatMessages({
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
}: {
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  activeConversationRef: MutableRefObject<string | null>;
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
  setExecutionState: React.Dispatch<React.SetStateAction<ExecutionState>>;
  getLatestConversations: () => Promise<any[]>;
  loadConversationMessages: (id: string) => Promise<Message[]>;
  setConversations: React.Dispatch<React.SetStateAction<any[]>>;
  loadConversations: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendConversationMessage = useCallback(async ({
    message,
    model,
    resetMessages = false,
    forceNewConversation = false,
  }: SendMessageParams) => {
    if (isLoading) return;

    let convId = forceNewConversation ? null : currentConversationId;
    let baseMessages: Message[] | null = null;

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
    // Send with null agentId — direct LLM + tools mode
    window.electronAPI.conversations.chat(convId, null, message, model || selectedModel || undefined);
  }, [isLoading, currentConversationId, selectedModel, activeConversationRef, setCurrentConversationId, setSelectedModel, setExecutionState, getLatestConversations, loadConversationMessages, setConversations, loadConversations]);

  const handleAbortChat = useCallback(() => {
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
  }, [currentConversationId, setExecutionState, activeConversationRef]);

  return {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    sendConversationMessage,
    handleAbortChat,
  };
}
