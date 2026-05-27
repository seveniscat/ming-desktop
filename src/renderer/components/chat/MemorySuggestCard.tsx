import { useState } from 'react';
import { Brain, Check, X, Pencil, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export interface MemorySuggestion {
  content: string;
  category: string;
  reason: string;
}

const categoryLabels: Record<string, string> = {
  profile: 'Profile',
  preference: 'Preference',
  context: 'Context',
  custom: 'Custom',
};

const categoryColors: Record<string, string> = {
  profile: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  preference: 'bg-purple-500/15 text-purple-500 border-purple-500/20',
  context: 'bg-green-500/15 text-green-500 border-green-500/20',
  custom: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
};

interface MemorySuggestCardProps {
  suggestion: MemorySuggestion;
  onConfirm: (data: { content: string; category: string }) => void;
  onDismiss: () => void;
}

export default function MemorySuggestCard({ suggestion, onConfirm, onDismiss }: MemorySuggestCardProps) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(suggestion.content);
  const [category, setCategory] = useState(suggestion.category);

  const handleConfirm = () => {
    onConfirm({ content: content.trim(), category });
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5 max-w-md">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Brain size={14} className="text-primary" />
          <span className="text-xs font-medium text-primary">Memory Suggestion</span>
        </div>
        <Sparkles size={10} className="text-primary/60" />
        <span className="text-[10px] text-muted-foreground ml-auto">Agent suggested</span>
      </div>

      {/* Content */}
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profile">Profile</SelectItem>
              <SelectItem value="preference">Preference</SelectItem>
              <SelectItem value="context">Context</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm leading-relaxed">{suggestion.content}</p>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium ${
                categoryColors[suggestion.category] || categoryColors.custom
              }`}
            >
              {categoryLabels[suggestion.category] || suggestion.category}
            </span>
          </div>
          {suggestion.reason && (
            <p className="text-xs text-muted-foreground italic">
              {suggestion.reason}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {editing ? (
          <>
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleConfirm} disabled={!content.trim()}>
              <Check size={12} />
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleConfirm}>
              <Check size={12} />
              Remember
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditing(true)}>
              <Pencil size={12} />
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={onDismiss}>
              <X size={12} />
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
