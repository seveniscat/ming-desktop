import { Send, Square, Cpu, FileText, Wrench, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
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
  selectedModel,
  setSelectedModel,
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
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  // Group suggestions by type
  const groupedSuggestions = () => {
    const tools = promptSuggestions.filter(s => s.type === 'tool');
    const others = promptSuggestions.filter(s => s.type !== 'tool');
    return { tools, others };
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'tool': return <Wrench size={15} />;
      case 'skill': return <Zap size={15} />;
      default: return <FileText size={15} />;
    }
  };

  const renderGroup = (items: PromptSuggestion[], groupLabel?: string) => {
    const result: React.ReactNode[] = [];
    if (groupLabel && items.length > 0) {
      result.push(
        <div key={`header-${groupLabel}`} className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {groupLabel}
        </div>
      );
    }
    items.forEach((suggestion, i) => {
      const globalIndex = promptSuggestions.indexOf(suggestion);
      result.push(
        <button
          key={suggestion.id}
          type="button"
          className={cn(
            'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
            globalIndex === selectedPromptIndex ? 'bg-primary/10 text-foreground' : 'hover:bg-[var(--surface-hover)]'
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            onApplyPromptSuggestion(suggestion);
          }}
        >
          <span className="mt-0.5 text-muted-foreground shrink-0">{getIconForType(suggestion.type)}</span>
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
      );
    });
    return result;
  };

  return (
    <div className="p-4 bg-background">
      {/* Compact controls — model selector only */}
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
      </div>

      {/* Input container */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[var(--surface)] p-3 transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_0_2px_hsl(var(--primary)/0.1)]">
        <div className="relative flex gap-3">
          {/* Slash menu */}
          <AnimatePresence>
            {promptMenuOpen && (() => {
              const { tools, others } = groupedSuggestions();
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-14 bottom-full mb-3 rounded-xl border border-[hsl(var(--border))] bg-[var(--surface)] text-foreground shadow-xl overflow-hidden z-50 max-h-[300px] overflow-y-auto"
                >
                  {renderGroup(tools, 'Tools')}
                  {renderGroup(others, 'Skills & Prompts')}
                </motion.div>
              );
            })()}
          </AnimatePresence>

          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={onKeyDown}
            placeholder="Message... (type / for tools & prompts)"
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
          <span className="truncate">Enter to send, type / for tools & prompts</span>
          <span>{selectedModel || 'No model'}</span>
        </div>
      </div>
    </div>
  );
}
