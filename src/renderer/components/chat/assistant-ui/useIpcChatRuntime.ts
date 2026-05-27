import { useCallback, useRef } from 'react';
import {
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
} from '@assistant-ui/react';
import type { Message } from '../types';
import {
  toThreadMessageLike,
  createEmptyAssistantMessage,
  appendStreamText,
  appendStreamError,
} from './messageAdapter';

export interface MemorySuggestionEvent {
  content: string;
  category: string;
  reason: string;
}

interface UseIpcChatRuntimeOptions {
  /** Current conversation ID (null = new conversation) */
  conversationId: string | null;
  /** Callback to set the conversation ID after creation */
  setConversationId: (id: string | null) => void;
  /** Current messages array */
  messages: Message[];
  /** Messages setter */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Whether the AI is currently streaming */
  isRunning: boolean;
  /** Running state setter */
  setIsRunning: (running: boolean) => void;
  /** Currently selected model */
  selectedModel: string | null;
  /** Active skill IDs for the current conversation */
  activeSkillIds: string[];
  /** Called when the agent suggests a memory via suggest_memory tool */
  onMemorySuggestion?: (suggestion: MemorySuggestionEvent) => void;
}

/**
 * Bridges Electron IPC streaming to assistant-ui's runtime via
 * `useExternalStoreRuntime`.
 *
 * The hook manages:
 * - Registering/cleaning up IPC stream listeners (chunk, end, error, tool-event)
 * - Auto-creating a conversation on first send
 * - Converting native Message[] to ThreadMessageLike[] for assistant-ui
 * - Handling abort via IPC
 */
export function useIpcChatRuntime({
  conversationId,
  setConversationId,
  messages,
  setMessages,
  isRunning,
  setIsRunning,
  selectedModel,
  activeSkillIds,
  onMemorySuggestion,
}: UseIpcChatRuntimeOptions) {
  // Track the active streaming conversation so IPC callbacks can filter
  const activeConvRef = useRef<string | null>(null);

  // --- onNew: called when the user sends a message via assistant-ui ---
  const onNew = useCallback(
    async (message: Parameters<ExternalStoreAdapter<Message>['onNew']>[0]) => {
      // Extract text from the AppendMessage
      let text = '';
      if (typeof message.content === 'string') {
        text = message.content;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            text += (part as { type: 'text'; text: string }).text;
          }
        }
      }

      if (!text.trim()) return;

      // Auto-create conversation if needed
      let convId: string;
      if (conversationId) {
        convId = conversationId;
      } else {
        try {
          const conv = await window.electronAPI.conversations.create();
          convId = conv.id;
          setConversationId(convId);
        } catch (error) {
          console.error('Failed to create conversation:', error);
          return;
        }
      }

      activeConvRef.current = convId;

      // Add user + empty assistant messages
      const userMsg: Message = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      const assistantMsg = createEmptyAssistantMessage();

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsRunning(true);

      // Register IPC listeners for this stream
      const removeChunk = window.electronAPI.conversations.onStreamChunk(
        (data) => {
          if (data.conversationId !== convId) return;
          setMessages((prev) => appendStreamText(prev, data.content));
        },
      );

      const removeEnd = window.electronAPI.conversations.onStreamEnd(
        (data) => {
          removeChunk();
          removeEnd();
          removeError();
          removeToolEvent();
          if (data.conversationId !== convId) return;
          setIsRunning(false);
          activeConvRef.current = null;
        },
      );

      const removeError = window.electronAPI.conversations.onStreamError(
        (data) => {
          removeChunk();
          removeEnd();
          removeError();
          removeToolEvent();
          if (data.conversationId !== convId) return;
          setMessages((prev) => appendStreamError(prev, data.error));
          setIsRunning(false);
          activeConvRef.current = null;
        },
      );

      const removeToolEvent =
        window.electronAPI.conversations.onStreamToolEvent((data) => {
          if (data.conversationId !== convId) return;
          if (data.event === 'tool_result' && data.toolName === 'suggest_memory') {
            try {
              const parsed = JSON.parse(data.result);
              if (parsed.suggested && parsed.memory) {
                onMemorySuggestion?.({
                  content: parsed.memory.content,
                  category: parsed.memory.category,
                  reason: parsed.memory.reason || '',
                });
              }
            } catch {}
          }
        });

      // Send the message via IPC
      window.electronAPI.conversations.chat(
        convId,
        null,
        text,
        selectedModel || undefined,
        activeSkillIds.length > 0 ? activeSkillIds : undefined,
      );
    },
    [conversationId, setConversationId, setMessages, setIsRunning, selectedModel, activeSkillIds, onMemorySuggestion],
  );

  // --- onCancel: abort the current stream ---
  const onCancel = useCallback(async () => {
    const convId = activeConvRef.current || conversationId;
    if (!convId) return;
    window.electronAPI.conversations.abort(convId);
    setIsRunning(false);
    activeConvRef.current = null;
  }, [conversationId, setIsRunning]);

  // Build the ExternalStoreAdapter
  const adapter: ExternalStoreAdapter<Message> = {
    isRunning,
    messages,
    convertMessage: toThreadMessageLike,
    onNew,
    onCancel,
  };

  return useExternalStoreRuntime(adapter);
}
