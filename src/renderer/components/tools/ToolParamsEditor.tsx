import { useState } from 'react';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { ToolRecord } from '../../../shared/types';

interface ToolParamsEditorProps {
  tool: ToolRecord;
  onUpdate: () => void;
}

const EXAMPLE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'The input text to process',
    },
    maxResults: {
      type: 'number',
      description: 'Maximum number of results',
    },
  },
  required: ['input'],
}, null, 2);

export default function ToolParamsEditor({ tool, onUpdate }: ToolParamsEditorProps) {
  const [schema, setSchema] = useState(tool.parameters_schema || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateJSON = (text: string): boolean => {
    if (!text.trim()) {
      setError(null);
      return true;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed.type !== 'object') {
        setError('Root type must be "object"');
        return false;
      }
      if (!parsed.properties || typeof parsed.properties !== 'object') {
        setError('Must have a "properties" object');
        return false;
      }
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateJSON(schema)) return;
    setSaving(true);
    try {
      await window.electronAPI.tools.update(tool.id, {
        parameters_schema: schema.trim() || null,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to update schema:', error);
    } finally {
      setSaving(false);
    }
  };

  const parsedProps = (() => {
    if (!tool.parameters_schema) return [];
    try {
      const parsed = JSON.parse(tool.parameters_schema);
      return Object.entries(parsed.properties || {}).map(([key, val]: [string, any]) => ({
        name: key,
        type: val.type || 'any',
        description: val.description || '',
        required: parsed.required?.includes(key) ?? false,
      }));
    } catch {
      return [];
    }
  })();

  const hasChanges = schema !== (tool.parameters_schema || '');

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Label className="mb-2 block text-sm">Parameters JSON Schema</Label>
        <p className="text-xs text-muted-foreground mb-3">
          Define the input parameters this tool accepts using JSON Schema format.
        </p>
        <Textarea
          value={schema}
          onChange={(e) => {
            setSchema(e.target.value);
            validateJSON(e.target.value);
          }}
          placeholder={EXAMPLE_SCHEMA}
          rows={14}
          className="font-mono text-sm"
        />
        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}
      </div>

      {/* Preview parsed parameters */}
      {parsedProps.length > 0 && (
        <div>
          <Label className="mb-2 block text-sm">Detected Parameters</Label>
          <div className="rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
            {parsedProps.map((prop) => (
              <div key={prop.name} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm font-mono font-medium">{prop.name}</span>
                <Badge variant="secondary" className="text-[10px]">{prop.type}</Badge>
                {prop.required && (
                  <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/30">required</Badge>
                )}
                <span className="text-xs text-muted-foreground">{prop.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !!error}>
          {saving ? 'Saving...' : 'Save Schema'}
        </Button>
      </div>
    </div>
  );
}
