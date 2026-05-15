import { useEffect, useRef } from 'react';
import { Brain, CheckCircle2, AlertCircle, Wrench, Radio, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExecutionStep } from './types';

interface ExecutionDetailsProps {
  steps: ExecutionStep[];
  collapsed: boolean;
  finished: boolean;
  onToggle: () => void;
}

export default function ExecutionDetails({ steps, collapsed, finished, onToggle }: ExecutionDetailsProps) {
  const visibleSteps = steps.slice(-24);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (collapsed) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [visibleSteps, collapsed]);

  if (visibleSteps.length === 0) return null;

  const iconFor = (step: ExecutionStep) => {
    if (step.status === 'error') return <AlertCircle size={14} />;
    if (step.type === 'tool') return <Wrench size={14} />;
    if (step.type === 'chunk') return <Radio size={14} />;
    if (step.status === 'done') return <CheckCircle2 size={14} />;
    return <Brain size={14} />;
  };

  return (
    <div className="w-full rounded-xl border border-[hsl(var(--border))] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 border-b border-[hsl(var(--border))] bg-[var(--surface-hover)] hover:brightness-110 transition-all"
      >
        <div className="flex items-center gap-2 text-sm font-medium min-w-0">
          <Brain size={15} className={cn(finished ? 'text-emerald-500' : 'text-primary')} />
          <span>{finished ? '执行记录' : '执行中'}</span>
          <span className="text-[11px] text-muted-foreground">{visibleSteps.length} steps</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!finished && (
            <span className="inline-flex items-center gap-1 text-[11px] text-primary">
              <Sparkles size={12} className="animate-pulse" />
              Running
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn('transition-transform duration-200', !collapsed && 'rotate-180')}
          />
        </div>
      </button>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="h-40 overflow-y-auto p-2 space-y-1.5 scroll-smooth"
        >
          {visibleSteps.map((step) => (
            <div
              key={step.id}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              <div
                className={cn(
                  'mt-0.5 shrink-0',
                  step.status === 'error' ? 'text-destructive' :
                  step.status === 'done' ? 'text-emerald-500' :
                  'text-primary'
                )}
              >
                {iconFor(step)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{step.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {step.detail && (
                  <div className="mt-0.5 text-muted-foreground break-words line-clamp-2">
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
