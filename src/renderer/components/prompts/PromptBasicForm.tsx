import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { PromptTemplate } from '../../../shared/types';

interface PromptBasicFormProps {
  prompt: PromptTemplate;
  onUpdate: () => void;
}

const TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'system', label: 'System' },
];

const CATEGORIES = [
  { value: 'coding', label: 'Coding' },
  { value: 'writing', label: 'Writing' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'general', label: 'General' },
];

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

export default function PromptBasicForm({ prompt, onUpdate }: PromptBasicFormProps) {
  const [form, setForm] = useState({
    name: prompt.name,
    type: prompt.type,
    trigger: prompt.trigger,
    category: prompt.category || '',
    description: prompt.description,
    content: prompt.content,
    tags: prompt.tags || [],
  });
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const detectedVars = extractVariables(form.content);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.prompts.update(prompt.id, {
        name: form.name.trim(),
        type: form.type,
        trigger: form.trigger.trim(),
        description: form.description.trim(),
        content: form.content,
        category: form.category || null,
        tags: form.tags,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to update prompt:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const hasChanges =
    form.name !== prompt.name ||
    form.type !== prompt.type ||
    form.trigger !== prompt.trigger ||
    form.description !== prompt.description ||
    form.content !== prompt.content ||
    form.category !== (prompt.category || '') ||
    JSON.stringify(form.tags) !== JSON.stringify(prompt.tags || []);

  return (
    <div className="max-w-2xl space-y-5">
      {/* Name + Type */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block text-sm">Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Code Review"
          />
        </div>
        <div>
          <Label className="mb-2 block text-sm">Type</Label>
          <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trigger + Category */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block text-sm">Trigger</Label>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-mono text-sm">/</span>
            <Input
              value={form.trigger}
              onChange={(e) => setForm({ ...form, trigger: e.target.value })}
              placeholder="e.g., review"
              className="font-mono"
            />
          </div>
        </div>
        <div>
          <Label className="mb-2 block text-sm">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Description */}
      <div>
        <Label className="mb-2 block text-sm">Description</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="A short description of what this prompt does"
        />
      </div>

      {/* Content */}
      <div>
        <Label className="mb-2 block text-sm">Content</Label>
        <Textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="Enter prompt content. Use {variable_name} for template variables."
          className="min-h-[240px] font-mono text-sm"
        />
      </div>

      {/* Detected Variables */}
      {detectedVars.length > 0 && (
        <div>
          <Label className="mb-2 block text-sm">Detected Variables</Label>
          <div className="flex flex-wrap gap-1.5">
            {detectedVars.map((v) => (
              <Badge key={v} variant="secondary" className="font-mono text-xs">
                {'{' + v + '}'}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      <div>
        <Label className="mb-2 block text-sm">Tags</Label>
        <div className="flex items-center gap-2 mb-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Type a tag and press Enter"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="secondary" onClick={handleAddTag} className="h-8">
            Add
          </Button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => handleRemoveTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !form.name.trim()}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
