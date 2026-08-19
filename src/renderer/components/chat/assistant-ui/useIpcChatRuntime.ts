import { useCallback, useEffect, useRef } from 'react';
import {
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
} from '@assistant-ui/react';
import type { Message, ToolCallRecord } from '../types';
import { applyToolStreamEventToMessages } from '../../../../shared/toolStream';
import {
  toThreadMessageLike,
  createEmptyAssistantMessage,
  appendStreamText,
  appendStreamError,
  appendReasoningChunk,
  upsertToolCall,
} from './messageAdapter';

export interface SendChatMessageOptions {
  extraSkillIds?: string[];
  model?: string;
  conversationId?: string;
  onConversationReady?: (conversationId: string) => void;
  onSettled?: () => void;
}

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
  /** Fires with the active conversation id when a send starts, and null when it settles */
  onActiveConversation?: (conversationId: string | null) => void;
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
  onActiveConversation,
}: UseIpcChatRuntimeOptions) {
  // Track the active streaming conversation so IPC callbacks can filter
  const activeConvRef = useRef<string | null>(null);
  // Stable ref to setMessages so non-onNew callbacks can access it
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  // Map of toolCallId → requestId for pending approvals
  const pendingApprovals = useRef(new Map<string, string>());

  // Listen for tool approval requests (from ToolApprovalManager IPC)
  // These arrive mid-stream and should be shown as requires-action tool calls
  useEffect(() => {
    if (!window.electronAPI?.tools?.onApprovalRequest) return;

    const unsubscribe = window.electronAPI.tools.onApprovalRequest(
      (data: { requestId: string; toolName: string; params: Record<string, any> }) => {
        const toolCallId = `approval-${data.requestId}`;
        pendingApprovals.current.set(toolCallId, data.requestId);

        const record: ToolCallRecord = {
          id: toolCallId,
          toolName: data.toolName,
          args: data.params,
          argsText: JSON.stringify(data.params, null, 2),
          status: 'requires-action',
          approvalPayload: {
            requestId: data.requestId,
            toolName: data.toolName,
            params: data.params,
          },
        };
        setMessagesRef.current((prev) => upsertToolCall(prev, record));
      },
    );

    return unsubscribe;
  }, []);

  const sendMessage = useCallback(
    async (text: string, options?: SendChatMessageOptions) => {
      if (!text.trim()) return;
      if (isRunning) return;

      let convId: string;
      if (options?.conversationId) {
        convId = options.conversationId;
        if (convId !== conversationId) {
          setConversationId(convId);
        }
      } else if (conversationId) {
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
      onActiveConversation?.(convId);
      options?.onConversationReady?.(convId);

      const userMsg: Message = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      const assistantMsg = createEmptyAssistantMessage();

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsRunning(true);

      const settle = () => {
        setIsRunning(false);
        activeConvRef.current = null;
        onActiveConversation?.(null);
        options?.onSettled?.();
      };

      const removeChunk = window.electronAPI.conversations.onStreamChunk(
        (data) => {
          if (data.conversationId !== convId) return;
          setMessages((prev) => appendStreamText(prev, data.content));
        },
      );

      const removeReasoningChunk = window.electronAPI.conversations.onStreamReasoningChunk(
        (data) => {
          if (data.conversationId !== convId) return;
          setMessages((prev) => appendReasoningChunk(prev, data.content));
        },
      );

      const removeEnd = window.electronAPI.conversations.onStreamEnd(
        (data) => {
          removeChunk();
          removeReasoningChunk();
          removeEnd();
          removeError();
          removeToolEvent();
          if (data.conversationId !== convId) return;
          if (data.reasoningContent) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant' && !last.reasoningContent) {
                updated[updated.length - 1] = { ...last, reasoningContent: data.reasoningContent };
              }
              return updated;
            });
          }
          settle();
        },
      );

      const removeError = window.electronAPI.conversations.onStreamError(
        (data) => {
          removeChunk();
          removeReasoningChunk();
          removeEnd();
          removeError();
          removeToolEvent();
          if (data.conversationId !== convId) return;
          setMessages((prev) => appendStreamError(prev, data.error));
          settle();
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

          setMessages((prev) => applyToolStreamEventToMessages(prev, data));
        });

      const skillIds = [...new Set([
        ...activeSkillIds,
        ...(options?.extraSkillIds || []),
      ])];
      const model = options?.model || selectedModel || undefined;

      window.electronAPI.conversations.chat(
        convId,
        null,
        text,
        model,
        skillIds.length > 0 ? skillIds : undefined,
      );
    },
    [conversationId, isRunning, setConversationId, setMessages, setIsRunning, selectedModel, activeSkillIds, onMemorySuggestion, onActiveConversation],
  );

  // --- onNew: called when the user sends a message via assistant-ui ---
  const onNew = useCallback(
    async (message: Parameters<ExternalStoreAdapter<Message>['onNew']>[0]) => {
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

      await sendMessage(text);
    },
    [sendMessage],
  );

  // --- onCancel: abort the current stream ---
  const onCancel = useCallback(async () => {
    const convId = activeConvRef.current || conversationId;
    if (!convId) return;
    window.electronAPI.conversations.abort(convId);
    setIsRunning(false);
    activeConvRef.current = null;
    onActiveConversation?.(null);
  }, [conversationId, setIsRunning, onActiveConversation]);

  // Build the ExternalStoreAdapter
  const adapter: ExternalStoreAdapter<Message> = {
    isRunning,
    messages,
    convertMessage: toThreadMessageLike,
    onNew,
    onCancel,
  };

  const runtime = useExternalStoreRuntime(adapter);

  /** Respond to an inline tool approval request */
  const respondApproval = useCallback(
    (toolCallId: string, approved: boolean) => {
      const requestId = pendingApprovals.current.get(toolCallId);
      if (!requestId) return;

      // Send IPC response to backend
      window.electronAPI.tools.respondApproval(requestId, approved);

      // Clean up pending map
      pendingApprovals.current.delete(toolCallId);

      // Update the tool call record status
      setMessagesRef.current((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant' && last.toolCalls?.length) {
          const idx = last.toolCalls.findIndex(
            (tc) => tc.id === toolCallId && tc.status === 'requires-action',
          );
          if (idx >= 0) {
            const updated = { ...last, toolCalls: [...last.toolCalls] };
            updated.toolCalls[idx] = {
              ...updated.toolCalls[idx],
              status: approved ? ('complete' as const) : ('incomplete' as const),
              result: approved ? 'Approved by user' : undefined,
              error: approved ? undefined : 'Denied by user',
            };
            msgs[msgs.length - 1] = updated;
          }
        }
        return msgs;
      });
    },
    [],
  );

  return {
    runtime,
    sendMessage,
    respondApproval,
    pendingApprovals: pendingApprovals.current,
  };
}
