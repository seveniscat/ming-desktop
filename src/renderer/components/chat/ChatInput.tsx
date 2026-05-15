import { Send, Square, Cpu, Bot, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Agent, LLMProvider, PromptSuggestion } from './types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  selectedAgent: Agent | undefined;
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
  agents: Agent[];
  setSelectedAgentId: (id: string | null) => void;
  providers: LLMProvider[];
  promptMenuOpen: boolean;
  promptSuggestions: PromptSuggestion[];
  selectedPromptIndex: number;
  onSend: () => void;
  onAbort: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onApplyPromptSuggestion: (suggestion: PromptSuggestion) => void;
}

export default function ChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  selectedAgent,
  selectedModel,
  setSelectedModel,
  agents,
  setSelectedAgentId,
  providers,
  promptMenuOpen,
  promptSuggestions,
  selectedPromptIndex,
  onSend,
  onAbort,
  onKeyDown,
  onApplyPromptSuggestion,
}: ChatInputProps) {
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  return (
    <div className="p-4 bg-background">
      {/* Compact controls */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] text-xs text-muted-foreground">
          <Cpu size={12} />
          <select
            value={selectedModel || ''}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-transparent border-none text-xs text-muted-foreground cursor-pointer focus:outline-none"
          >
            {providers.map((provider) =>
              (provider.enabledModels || []).map((model) => (
                <option key={`${provider.id}-${model}`} value={model}>
                  {model}
                </option>
              ))
            )}
          </select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={selectedAgent ? `Agent: ${selectedAgent.name}` : 'Agent'}
            >
              <Bot size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {agents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
              >
                {agent.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="日报"
          onClick={() => setInput('/日报')}
          disabled={isLoading}
        >
          <FileText size={14} />
        </Button>
      </div>

      {/* Input container */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[var(--surface)] p-3 transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_0_2px_hsl(var(--primary)/0.1)]">
        <div className="relative flex gap-3">
          {/* Prompt suggestion menu */}
          <AnimatePresence>
            {promptMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-14 bottom-full mb-3 rounded-xl border border-[hsl(var(--border))] bg-[var(--surface)] text-foreground shadow-xl overflow-hidden z-50"
              >
                {promptSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
                      index === selectedPromptIndex ? 'bg-primary/10 text-foreground' : 'hover:bg-[var(--surface-hover)]'
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onApplyPromptSuggestion(suggestion);
                    }}
                  >
                    <FileText size={15} className="mt-0.5 text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{suggestion.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">/{suggestion.trigger}</span>
                      </span>
                      {suggestion.description && (
                        <span className="block text-xs text-muted-foreground truncate mt-0.5">
                          {suggestion.description}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={onKeyDown}
            placeholder={`Message ${selectedAgent?.name || 'agent'}...`}
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent border-0 shadow-none resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 min-h-[24px] max-h-[160px]"
          />

          {isLoading ? (
            <Button
              onClick={onAbort}
              size="icon"
              variant="destructive"
              className="h-9 w-9 rounded-xl shrink-0 self-end transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
              title="终止生成"
            >
              <Square size={14} />
            </Button>
          ) : (
            <Button
              onClick={onSend}
              disabled={!input.trim()}
              size="icon"
              className="h-9 w-9 rounded-xl shrink-0 self-end transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Send size={14} />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">Enter to send, type / for prompts</span>
          <span>{selectedModel || 'No model'}</span>
        </div>
      </div>
    </div>
  );
}
