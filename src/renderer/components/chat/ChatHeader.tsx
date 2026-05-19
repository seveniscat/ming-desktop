import { MessageSquare } from 'lucide-react';

export default function ChatHeader() {
  return (
    <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-background flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <MessageSquare size={16} className="text-primary" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">Chat</h3>
        <p className="text-xs text-muted-foreground">Direct LLM conversation with tool support</p>
      </div>
    </div>
  );
}
