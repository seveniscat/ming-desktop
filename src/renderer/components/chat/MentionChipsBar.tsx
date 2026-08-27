import { Brain, Zap, FileText, GitBranch, X } from 'lucide-react';
import type { MentionReference, MentionKind } from '../../../shared/types';

const KIND_ICON: Record<MentionKind, typeof Brain> = {
  memory: Brain,
  skill: Zap,
  git: GitBranch,
  file: FileText,
};

/** 输入框上方的引用条：本次发送将携带的 @ 引用，可逐个移除 */
export default function MentionChipsBar({
  chips,
  onRemove,
}: {
  chips: MentionReference[];
  onRemove: (ref: MentionReference) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
      {chips.map((chip) => {
        const Icon = KIND_ICON[chip.kind];
        return (
          <span
            key={`${chip.kind}-${chip.id}`}
            className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            <Icon size={11} className="shrink-0" />
            <span className="truncate">{chip.label}</span>
            <button
              type="button"
              onClick={() => onRemove(chip)}
              aria-label={`移除引用 ${chip.label}`}
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={9} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
