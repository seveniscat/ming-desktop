import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageBubble from './MessageBubble';
import ExecutionDetails from './ExecutionDetails';
import EmptyState from './EmptyState';
import type { Message, ExecutionState } from './types';

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  executionState: ExecutionState;
  selectedAgent?: any;
  onToggleExecution: () => void;
  onSuggestionClick?: (text: string) => void;
}

export default function ChatMessages({
  messages,
  isLoading,
  executionState,
  onToggleExecution,
  onSuggestionClick,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, executionState.steps.length, executionState.collapsed, isLoading]);

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 space-y-6">
        {messages.length === 0 ? (
          <EmptyState
            onSuggestionClick={onSuggestionClick}
          />
        ) : (
          messages.map((message, index) => {
            const isLoadingAssistant = isLoading && index === messages.length - 1 && message.role === 'assistant' && message.content === '';
            if (isLoadingAssistant) return null;
            return <MessageBubble key={index} message={message} />;
          })
        )}

        {executionState.steps.length > 0 && (
          <div className="ml-11 max-w-[80%]">
            <ExecutionDetails
              steps={executionState.steps}
              collapsed={executionState.collapsed}
              finished={executionState.finished}
              onToggle={onToggleExecution}
            />
          </div>
        )}

        {/* Typing indicator */}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary text-primary-foreground shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-[var(--surface)] border border-[hsl(var(--border))] px-4 py-3 rounded-2xl">
              <div className="flex gap-1.5">
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
  );
}
