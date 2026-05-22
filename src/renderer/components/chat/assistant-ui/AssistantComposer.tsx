import { ComposerPrimitive } from '@assistant-ui/react';
import { Cpu, X } from 'lucide-react';
import type { LLMProvider } from '../types';

export interface AssistantComposerProps {
  /** Available LLM providers (for model selector) */
  providers: LLMProvider[];
  /** Currently selected model ID */
  selectedModel: string | null;
  /** Callback to change the selected model */
  setSelectedModel: (model: string | null) => void;
  /** Active skill badges to display above the input */
  activeSkillBadges: { id: string; name: string }[];
  /** Callback to remove a skill */
  onRemoveSkill: (skillId: string) => void;
}

/**
 * Composer component built on assistant-ui's ComposerPrimitive.
 *
 * Wraps the headless composer with:
 * - Model selector dropdown above the input
 * - Active skill badges above the input
 * - Styled text input with auto-resize
 * - Send / Cancel buttons
 */
export function AssistantComposer({
  providers,
  selectedModel,
  setSelectedModel,
  activeSkillBadges,
  onRemoveSkill,
}: AssistantComposerProps) {
  return (
    <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]">
      {/* Compact controls row */}
      <div className="flex items-center gap-2 px-4 pt-3">
        {/* Model selector */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] text-xs text-[hsl(var(--muted-foreground))]">
          <Cpu size={12} />
          <select
            value={selectedModel || ''}
            onChange={(e) => setSelectedModel(e.target.value || null)}
            className="bg-transparent border-none text-xs text-[hsl(var(--muted-foreground))] cursor-pointer focus:outline-none"
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

      {/* Active skill badges */}
      {activeSkillBadges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {activeSkillBadges.map((skill) => (
            <span
              key={skill.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] text-xs font-medium"
            >
              {skill.name}
              <button
                type="button"
                onClick={() => onRemoveSkill(skill.id)}
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-[hsl(var(--primary)/0.2)] transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Composer input area */}
      <div className="px-4 py-3">
        <ComposerPrimitive.Root className="flex items-end gap-2">
          <ComposerPrimitive.Input
            placeholder="Message... (type / for tools & prompts)"
            className="flex-1 min-h-[2.5rem] max-h-[10rem] resize-none border border-[hsl(var(--border))] rounded-xl px-3 py-2 text-sm bg-[var(--surface)] text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary)/0.5)] focus:shadow-[0_0_0_2px_hsl(var(--primary)/0.1)] placeholder:text-[hsl(var(--muted-foreground))] transition-all"
          />
          <ComposerPrimitive.Send className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </ComposerPrimitive.Send>
          <ComposerPrimitive.Cancel className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </ComposerPrimitive.Cancel>
        </ComposerPrimitive.Root>

        {/* Helper text */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
          <span className="truncate">Enter to send, type / for tools & prompts</span>
          <span>{selectedModel || 'No model'}</span>
        </div>
      </div>
    </div>
  );
}
