import { useState, useCallback, useRef } from 'react';
import type { Conversation, Message } from '../types';

export function useChatConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);

  const normalizeMessages = (items: any[]): Message[] =>
    items
      .filter((m: any) => m.role !== 'system')
      .map((m: any) => ({
        role: m.role,
        content: m.content,
        reasoningContent: m.reasoning_content || undefined,
        timestamp: m.timestamp,
      }));

  const loadConversationMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
    const msgs = await window.electronAPI.conversations.messages(conversationId);
    return normalizeMessages(msgs);
  }, []);

  const getLatestConversations = useCallback(async (): Promise<Conversation[]> => {
    const result = await window.electronAPI.conversations.list();
    setConversations(result);
    return result;
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      await getLatestConversations();
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, [getLatestConversations]);

  const handleNewConversation = useCallback(async () => {
    try {
      const conv = await window.electronAPI.conversations.create();
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(conv.id);
      activeConversationRef.current = null;
      return conv;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  }, []);

  const handleDeleteConversation = useCallback(async (convId: string) => {
    try {
      await window.electronAPI.conversations.delete(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (currentConversationId === convId) {
        setCurrentConversationId(null);
        activeConversationRef.current = null;
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [currentConversationId]);

  const handleRenameConversation = useCallback(async (convId: string, newTitle: string) => {
    try {
      await window.electronAPI.conversations.rename(convId, newTitle);
      setConversations(prev =>
        prev.map(c => c.id === convId ? { ...c, title: newTitle } : c)
      );
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  }, []);

  return {
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
  };
}
