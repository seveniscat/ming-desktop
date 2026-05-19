import { Sparkles, Code, MessageSquare, Lightbulb } from 'lucide-react';
import { motion } from 'framer-motion';
import { fadeInUp, smoothTransition } from '@/lib/motion';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

const suggestions = [
  { icon: Code, title: 'Write code', text: 'Help me write a React component', description: 'Generate or review code' },
  { icon: MessageSquare, title: 'Explain', text: 'Explain how this codebase works', description: 'Understand concepts' },
  { icon: Lightbulb, title: 'Debug', text: 'Help me fix this error', description: 'Troubleshoot issues' },
];

export default function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      transition={{ ...smoothTransition, delay: 0.1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles size={32} className="text-primary" />
      </div>

      {/* Heading */}
      <h2 className="text-xl font-semibold text-foreground mb-2">
        How can I help?
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        Start a conversation
      </p>

      {/* Suggestion grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {suggestions.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => onSuggestionClick?.(s.text)}
              className="flex items-start gap-3 p-4 rounded-xl border border-[hsl(var(--border))] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors text-left group"
            >
              <Icon size={18} className="text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
