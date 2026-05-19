import { useState, useMemo } from 'react';
import { Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import type { ToolRecord } from '../../../shared/types';

interface ToolTesterProps {
  tool: ToolRecord;
}

interface ParamField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enumValues?: string[];
}

export default function ToolTester({ tool }: ToolTesterProps) {
  const [params, setParams] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ result: string; duration: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields: ParamField[] = useMemo(() => {
    if (!tool.parameters_schema) return [];
    try {
      const schema = JSON.parse(tool.parameters_schema);
      return Object.entries(schema.properties || {}).map(([key, val]: [string, any]) => ({
        name: key,
        type: val.type || 'string',
        description: val.description || '',
        required: schema.required?.includes(key) ?? false,
        enumValues: val.enum,
      }));
    } catch {
      return [];
    }
  }, [tool.parameters_schema]);

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    setError(null);
    try {
      const parsed: Record<string, any> = {};
      for (const [key, val] of Object.entries(params)) {
        if (val === '' || val === undefined) continue;
        const field = fields.find((f) => f.name === key);
        if (field?.type === 'number') {
          parsed[key] = Number(val);
        } else if (field?.type === 'boolean') {
          parsed[key] = val === 'true';
        } else if (field?.type === 'array') {
          try { parsed[key] = JSON.parse(val); } catch { parsed[key] = val; }
        } else {
          parsed[key] = val;
        }
      }
      const res = await window.electronAPI.tools.execute(tool.id, parsed);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  if (!tool.parameters_schema) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-lg border border-[hsl(var(--border))] p-6 text-center">
          <p className="text-muted-foreground">No parameters defined for this tool.</p>
          <p className="text-sm text-muted-foreground mt-1">Go to the Parameters tab to define the input schema first.</p>
        </div>
        <div className="mt-4">
          <Button onClick={handleExecute} disabled={executing || !tool.is_enabled} className="gap-2">
            {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Execute (no params)
          </Button>
        </div>
        {result && <ResultDisplay result={result} />}
        {error && <ErrorDisplay error={error} />}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Auto-generated form from schema */}
      <div>
        <h3 className="text-sm font-medium mb-3">Input Parameters</h3>
        <div className="space-y-4 rounded-lg border border-[hsl(var(--border))] p-4">
          {fields.map((field) => (
            <div key={field.name}>
              <Label className="mb-1.5 flex items-center gap-2 text-sm">
                <span className="font-mono">{field.name}</span>
                <Badge variant="secondary" className="text-[10px]">{field.type}</Badge>
                {field.required && (
                  <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/30">required</Badge>
                )}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground mb-1.5">{field.description}</p>
              )}
              {field.enumValues ? (
                <select
                  value={params[field.name] || ''}
                  onChange={(e) => setParams({ ...params, [field.name]: e.target.value })}
                  className="w-full h-9 rounded-md border border-[hsl(var(--border))] bg-background px-3 text-sm"
                >
                  <option value="">Select...</option>
                  {field.enumValues.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              ) : field.type === 'array' ? (
                <Textarea
                  value={params[field.name] || ''}
                  onChange={(e) => setParams({ ...params, [field.name]: e.target.value })}
                  placeholder='["item1", "item2"]'
                  rows={2}
                  className="font-mono text-sm"
                />
              ) : (
                <Input
                  value={params[field.name] || ''}
                  onChange={(e) => setParams({ ...params, [field.name]: e.target.value })}
                  placeholder={field.type === 'number' ? '0' : field.type === 'boolean' ? 'true/false' : `Enter ${field.name}...`}
                  type={field.type === 'number' ? 'number' : 'text'}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execute button */}
      <Button
        onClick={handleExecute}
        disabled={executing || !tool.is_enabled}
        className="gap-2"
      >
        {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        {executing ? 'Executing...' : 'Execute Tool'}
      </Button>

      {!tool.is_enabled && (
        <p className="text-sm text-destructive">This tool is disabled. Enable it to test.</p>
      )}

      <ResultDisplay result={result} />
      <ErrorDisplay error={error} />
    </div>
  );
}

function ResultDisplay({ result }: { result: { result: string; duration: number } | null }) {
  if (!result) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 size={16} className="text-green-500" />
        <h3 className="text-sm font-medium">Result</h3>
        <Badge variant="secondary" className="text-[10px]">{result.duration}ms</Badge>
      </div>
      <pre className="rounded-lg bg-muted/50 border border-[hsl(var(--border))] p-4 text-sm overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
        {(() => {
          try { return JSON.stringify(JSON.parse(result.result), null, 2); } catch { return result.result; }
        })()}
      </pre>
    </div>
  );
}

function ErrorDisplay({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={16} className="text-destructive" />
        <h3 className="text-sm font-medium text-destructive">Error</h3>
      </div>
      <pre className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm overflow-auto max-h-[200px] font-mono whitespace-pre-wrap">
        {error}
      </pre>
    </div>
  );
}
