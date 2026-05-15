import { motion, AnimatePresence } from 'framer-motion';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExecutionState } from './types';

interface AgentStatusBarProps {
  executionState: ExecutionState;
  isLoading: boolean;
  onAbort: () => void;
}

function getStatusText(executionState: ExecutionState): string {
  const { steps } = executionState;
  if (steps.length === 0) return 'Thinking...';

  const lastStep = steps[steps.length - 1];
  if (lastStep.type === 'tool' && lastStep.status === 'active') {
    const toolName = lastStep.title.replace(/^调用工具：/, '');
    return `Using tool: ${toolName}`;
  }
  if (lastStep.type === 'chunk') return 'Generating...';
  if (lastStep.type === 'request') return 'Thinking...';
  return 'Processing...';
}

export default function AgentStatusBar({ executionState, isLoading, onAbort }: AgentStatusBarProps) {
  const visible = isLoading && !executionState.finished;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 44, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="h-[44px] px-4 flex items-center justify-between bg-[var(--surface)] border-t border-[hsl(var(--border))]">
            <div className="flex items-center gap-3">
              {/* Breathing dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-breathe" />
              <span className="text-sm text-muted-foreground">
                {getStatusText(executionState)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAbort}
              className="h-7 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Square size={12} className="mr-1.5" />
              Stop
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
