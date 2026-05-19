import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { ToolRecord } from '../../../shared/types';

interface ToolBasicFormProps {
  tool: ToolRecord;
  onUpdate: () => void;
}

const CATEGORIES = [
  { value: 'file', label: 'File' },
  { value: 'code', label: 'Code' },
  { value: 'web', label: 'Web' },
  { value: 'system', label: 'System' },
  { value: 'custom', label: 'Custom' },
];

const IMPL_TYPES = [
  { value: 'builtin', label: 'Built-in' },
  { value: 'http', label: 'HTTP Request' },
  { value: 'script', label: 'Script' },
];

export default function ToolBasicForm({ tool, onUpdate }: ToolBasicFormProps) {
  const [form, setForm] = useState({
    display_name: tool.display_name,
    description: tool.description || '',
    category: tool.category || '',
    implementation_type: tool.implementation_type,
    implementation_config: tool.implementation_config || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.tools.update(tool.id, {
        display_name: form.display_name.trim(),
        description: form.description.trim(),
        category: form.category || null,
        implementation_type: form.implementation_type,
        implementation_config: form.implementation_config.trim() || null,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to update tool:', error);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    form.display_name !== tool.display_name ||
    form.description !== (tool.description || '') ||
    form.category !== (tool.category || '') ||
    form.implementation_type !== tool.implementation_type ||
    form.implementation_config !== (tool.implementation_config || '');

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Label className="mb-2 block text-sm">Tool Name (identifier)</Label>
        <Input value={tool.name} disabled className="bg-muted/50" />
        <p className="text-xs text-muted-foreground mt-1">Unique identifier, cannot be changed after creation</p>
      </div>

      <div>
        <Label className="mb-2 block text-sm">Display Name</Label>
        <Input
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          placeholder="e.g., Daily Report Generator"
        />
      </div>

      <div>
        <Label className="mb-2 block text-sm">Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What does this tool do?"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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

        <div>
          <Label className="mb-2 block text-sm">Implementation Type</Label>
          <Select value={form.implementation_type} onValueChange={(v: any) => setForm({ ...form, implementation_type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(form.implementation_type === 'http' || form.implementation_type === 'script') && (
        <div>
          <Label className="mb-2 block text-sm">
            Implementation Config (JSON)
          </Label>
          <Textarea
            value={form.implementation_config}
            onChange={(e) => setForm({ ...form, implementation_config: e.target.value })}
            placeholder={
              form.implementation_type === 'http'
                ? '{"url": "https://...", "method": "POST", "headers": {}}'
                : '{"command": "python3 script.py", "timeout": 30000}'
            }
            rows={4}
            className="font-mono text-sm"
          />
        </div>
      )}

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !form.display_name.trim()}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
