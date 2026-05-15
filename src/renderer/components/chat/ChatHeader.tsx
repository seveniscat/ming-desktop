import { Bot } from 'lucide-react';
import type { Agent } from './types';

interface ChatHeaderProps {
  selectedAgent: Agent | undefined;
}

export default function ChatHeader({ selectedAgent }: ChatHeaderProps) {
  return (
    <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-background flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Bot size={16} className="text-primary" />
      </div>
      {selectedAgent ? (
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{selectedAgent.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{selectedAgent.description}</p>
        </div>
      ) : (
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Select an agent</h3>
          <p className="text-xs text-muted-foreground">Choose an agent to start chatting</p>
        </div>
      )}
    </div>
  );
}
