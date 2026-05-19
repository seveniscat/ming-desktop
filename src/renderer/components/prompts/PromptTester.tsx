import { useState, useEffect, useMemo } from 'react';
import { Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { PromptTemplate } from '../../../shared/types';

interface PromptTesterProps {
  prompt: PromptTemplate;
}

export default function PromptTester({ prompt }: PromptTesterProps) {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const list = await window.electronAPI.llm.listProviders();
      const enabled = (list || []).filter((p: any) => p.enabled);
      setProviders(enabled);
      if (enabled.length > 0) {
        setSelectedProvider(enabled[0].id);
        if (enabled[0].enabledModels?.length > 0) {
          setSelectedModel(enabled[0].enabledModels[0]);
        } else if (enabled[0].models?.length > 0) {
          setSelectedModel(enabled[0].models[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

  const variables = useMemo(() => {
    const matches = prompt.content.match(/\{(\w+)\}/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }, [prompt.content]);

  const renderedContent = useMemo(() => {
    let content = prompt.content;
    for (const [key, value] of Object.entries(variableValues)) {
      content = content.split(`{${key}}`).join(value || `{${key}}`);
    }
    return content;
  }, [prompt.content, variableValues]);

  const availableModels = useMemo(() => {
    const provider = providers.find((p: any) => p.id === selectedProvider);
    if (!provider) return [];
    return provider.enabledModels?.length > 0 ? provider.enabledModels : (provider.models || []);
  }, [providers, selectedProvider]);

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    setSelectedModel('');
    const provider = providers.find((p: any) => p.id === providerId);
    if (provider) {
      const models = provider.enabledModels?.length > 0 ? provider.enabledModels : (provider.models || []);
      if (models.length > 0) {
        setSelectedModel(models[0]);
      }
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    setError(null);
    try {
      const model = selectedModel || undefined;
      const response = await window.electronAPI.prompts.test(renderedContent, model);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Model selector */}
      <div>
        <h3 className="text-sm font-medium mb-3">Model</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block text-sm">Provider</Label>
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m: string) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {providers.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">No LLM providers configured. Add one in Settings.</p>
        )}
      </div>

      {/* Variable inputs */}
      {variables.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Variables</h3>
          <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4">
            {variables.map((v) => (
              <div key={v}>
                <Label className="mb-1.5 flex items-center gap-2 text-sm">
                  <span className="font-mono">{'{' + v + '}'}</span>
                </Label>
                <Input
                  value={variableValues[v] || ''}
                  onChange={(e) => setVariableValues({ ...variableValues, [v]: e.target.value })}
                  placeholder={`Enter value for ${v}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rendered preview */}
      <div>
        <h3 className="text-sm font-medium mb-3">Rendered Preview</h3>
        <pre className="rounded-lg bg-muted/50 border border-[hsl(var(--border))] p-4 text-sm overflow-auto max-h-[300px] font-mono whitespace-pre-wrap">
          {renderedContent || '(empty)'}
        </pre>
      </div>

      {/* Run button */}
      <Button
        onClick={handleExecute}
        disabled={executing || !selectedProvider || !selectedModel}
        className="gap-2"
      >
        {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        {executing ? 'Running...' : 'Run Test'}
      </Button>

      {!selectedProvider && providers.length > 0 && (
        <p className="text-sm text-muted-foreground">Select a provider and model to run the test.</p>
      )}

      {/* Result */}
      {result && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <h3 className="text-sm font-medium">Response</h3>
          </div>
          <pre className="rounded-lg bg-muted/50 border border-[hsl(var(--border))] p-4 text-sm overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
            {result}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-destructive" />
            <h3 className="text-sm font-medium text-destructive">Error</h3>
          </div>
          <pre className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm overflow-auto max-h-[200px] font-mono whitespace-pre-wrap">
            {error}
          </pre>
        </div>
      )}
    </div>
  );
}
