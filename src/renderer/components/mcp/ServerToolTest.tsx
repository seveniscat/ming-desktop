import { useState, useMemo } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface ToolInfo {
  id: string;
  name: string;
  description: string | null;
  input_schema: string | null;
}

interface ServerToolTestProps {
  tools: ToolInfo[];
  onCallTool: (toolName: string, args: Record<string, unknown>) => Promise<any>;
}

function coerceValue(value: string, type: string): unknown {
  switch (type) {
    case 'number':
    case 'integer': {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }
    case 'boolean':
      return value === 'true';
    case 'object':
    case 'array': {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    default:
      return value;
  }
}

export function ServerToolTest({ tools, onCallTool }: ServerToolTestProps) {
  const [selectedToolName, setSelectedToolName] = useState<string>('');
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTool = useMemo(
    () => tools.find((t) => t.name === selectedToolName) || null,
    [tools, selectedToolName]
  );

  const schemaProperties = useMemo(() => {
    if (!selectedTool?.input_schema) return [];
    try {
      const schema = JSON.parse(selectedTool.input_schema);
      return Object.entries(schema.properties || {}).map(([key, value]: [string, any]) => ({
        key,
        type: value.type || 'string',
        description: value.description || '',
        required: (schema.required || []).includes(key),
      }));
    } catch {
      return [];
    }
  }, [selectedTool]);

  const handleToolChange = (name: string) => {
    setSelectedToolName(name);
    setInputValues({});
    setResult(null);
    setError(null);
  };

  const handleRun = async () => {
    if (!selectedToolName) return;

    const args: Record<string, unknown> = {};
    for (const { key, type } of schemaProperties) {
      const raw = inputValues[key];
      if (raw === undefined || raw === '') continue;
      args[key] = coerceValue(raw, type);
    }

    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const response = await onCallTool(selectedToolName, args);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  if (tools.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">No tools available. Connect to the server first.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-5 max-w-2xl">
        {/* Tool selector */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tool</Label>
          <Select value={selectedToolName} onValueChange={handleToolChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a tool..." />
            </SelectTrigger>
            <SelectContent>
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.name}>
                  <span className="font-mono">{tool.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTool?.description && (
            <p className="text-xs text-muted-foreground">{selectedTool.description}</p>
          )}
        </div>

        {/* Input fields */}
        {schemaProperties.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Inputs</Label>
            {schemaProperties.map(({ key, type, description, required }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">
                  <span className="font-mono text-foreground">{key}</span>
                  <span className="text-muted-foreground ml-1">
                    ({type}
                    {required && <span className="text-destructive"> *</span>})
                  </span>
                </Label>
                {description && (
                  <p className="text-[11px] text-muted-foreground">{description}</p>
                )}
                <Input
                  value={inputValues[key] || ''}
                  onChange={(e) =>
                    setInputValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={
                    type === 'object' || type === 'array'
                      ? 'JSON...'
                      : type === 'boolean'
                        ? 'true / false'
                        : `${type}...`
                  }
                  className="h-8 text-sm font-mono"
                />
              </div>
            ))}
          </div>
        )}

        {/* Run button */}
        <Button
          size="sm"
          className="h-7 gap-1.5"
          onClick={handleRun}
          disabled={!selectedToolName || running}
        >
          {running ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? 'Running...' : 'Run'}
        </Button>

        {/* Result */}
        {(result !== null || error !== null) && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {error ? 'Error' : 'Result'}
            </Label>
            <pre
              className={`p-3 rounded-lg text-xs font-mono overflow-auto max-h-80 border ${
                error
                  ? 'bg-destructive/5 border-destructive/20 text-destructive'
                  : 'bg-muted/50 border-[hsl(var(--border))] text-foreground'
              }`}
            >
              {error || result}
            </pre>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
