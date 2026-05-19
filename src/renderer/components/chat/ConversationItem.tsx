import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Conversation } from './types';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export default function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors',
        isActive
          ? 'bg-primary/5 border-l-2 border-primary'
          : 'hover:bg-[var(--surface-hover)] border-l-2 border-transparent'
      )}
    >
      <MessageSquare size={14} className="shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className="block text-sm leading-snug line-clamp-1 text-foreground">{conversation.title}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">
          {conversation.updatedAt
            ? new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            ...
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil size={14} className="mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={14} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
