import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, RefreshCw, ChevronDown, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { LLMProvider, LLMProviderConfig, ModuleType } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

interface ProviderPreset {
  id: string;
  label: string;
  moduleType: ModuleType;
  defaultBaseURL?: string;
  defaultModels: string[];
  requiresApiKey: boolean;
}

const PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', moduleType: 'openai-compatible', defaultBaseURL: 'https://api.openai.com/v1', defaultModels: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'], requiresApiKey: true },
  { id: 'anthropic', label: 'Anthropic', moduleType: 'anthropic', defaultBaseURL: 'https://api.anthropic.com', defaultModels: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'], requiresApiKey: true },
  { id: 'qwen', label: 'Qwen', moduleType: 'openai-compatible', defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'], requiresApiKey: true },
  { id: 'deepseek', label: 'DeepSeek', moduleType: 'openai-compatible', defaultBaseURL: 'https://api.deepseek.com/v1', defaultModels: ['deepseek-chat', 'deepseek-coder'], requiresApiKey: true },
  { id: 'groq', label: 'Groq', moduleType: 'openai-compatible', defaultBaseURL: 'https://api.groq.com/openai/v1', defaultModels: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'], requiresApiKey: true },
  { id: 'openrouter', label: 'OpenRouter', moduleType: 'openai-compatible', defaultBaseURL: 'https://openrouter.ai/api/v1', defaultModels: ['openai/gpt-4', 'anthropic/claude-3-opus'], requiresApiKey: true },
  { id: 'ollama', label: 'Ollama (Local)', moduleType: 'openai-compatible', defaultBaseURL: 'http://localhost:11434/v1', defaultModels: [], requiresApiKey: false },
  { id: 'custom', label: 'Custom', moduleType: 'openai-compatible', defaultModels: [], requiresApiKey: true },
  { id: 'claude-agent-sdk', label: 'Claude Agent SDK', moduleType: 'claude-agent-sdk', defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-7'], requiresApiKey: false },
];

function maskApiKey(key?: string): string {
  if (!key) return '—';
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'success'; message: string } | { status: 'error'; message: string };

interface Props {
  onBack: () => void;
}

export default function LLMConfiguration({ onBack }: Props) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultProviderId, setDefaultProviderId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null);
  const [addName, setAddName] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [addBaseURL, setAddBaseURL] = useState('');
  const [addModels, setAddModels] = useState('');
  const [saving, setSaving] = useState(false);
  const [addTestState, setAddTestState] = useState<TestState>({ status: 'idle' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBaseURL, setEditBaseURL] = useState('');
  const [editModels, setEditModels] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editTestState, setEditTestState] = useState<TestState>({ status: 'idle' });
  const [expandedModelsId, setExpandedModelsId] = useState<string | null>(null);
  const [fetchingModelsId, setFetchingModelsId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, def] = await Promise.all([
        window.electronAPI.llm.listProviders(),
        window.electronAPI.config.get('defaultLLMProvider') as Promise<string | undefined>,
      ]);
      setProviders(list);
      const enabled = list.find((p: LLMProvider) => p.enabled);
      setDefaultProviderId(
        def && list.some((p: LLMProvider) => p.id === def && p.enabled)
          ? def
          : (enabled?.id ?? '')
      );
    } catch (e) {
      console.error(e);
      setError('Failed to load LLM providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  const handleSelectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setAddName(preset.label);
    setAddBaseURL(preset.defaultBaseURL || '');
    setAddModels(preset.defaultModels.join(', '));
    setAddApiKey('');
    setAddTestState({ status: 'idle' });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPreset) { setError('Select a provider type'); return; }
    if (!addName.trim()) { setError('Name is required'); return; }
    if (selectedPreset.requiresApiKey && !addApiKey?.trim()) { setError('API key is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const models = addModels.split(',').map(s => s.trim()).filter(Boolean);
      const config: LLMProviderConfig = {
        name: addName.trim(),
        presetId: selectedPreset.id,
        moduleType: selectedPreset.moduleType,
        apiKey: selectedPreset.requiresApiKey ? addApiKey.trim() : undefined,
        baseURL: addBaseURL.trim() || undefined,
        models: models.length ? models : undefined,
      };
      await window.electronAPI.llm.addProvider(config);
      setShowAdd(false);
      setSelectedPreset(null);
      setAddName(''); setAddApiKey(''); setAddBaseURL(''); setAddModels('');
      setAddTestState({ status: 'idle' });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to add provider');
    } finally {
      setSaving(false);
    }
  };

  const handleTestAddConnection = async () => {
    if (!selectedPreset) return;
    setAddTestState({ status: 'testing' });
    try {
      const models = addModels.split(',').map(s => s.trim()).filter(Boolean);
      const config: LLMProviderConfig = {
        name: addName.trim() || 'test',
        presetId: selectedPreset.id,
        moduleType: selectedPreset.moduleType,
        apiKey: selectedPreset.requiresApiKey ? addApiKey.trim() : undefined,
        baseURL: addBaseURL.trim() || undefined,
        models: models.length ? models : undefined,
      };
      const provider = await window.electronAPI.llm.addProvider(config);
      const result = await window.electronAPI.llm.testConnection(provider.id);
      if (result.success) {
        setAddTestState({ status: 'success', message: result.message });
      } else {
        setAddTestState({ status: 'error', message: result.message });
        await window.electronAPI.llm.removeProvider(provider.id);
      }
      await loadProviders();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAddTestState({ status: 'error', message: msg });
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setEditTestState({ status: 'testing' });
    try {
      const result = await window.electronAPI.llm.testConnection(providerId);
      setEditTestState(result.success
        ? { status: 'success', message: result.message }
        : { status: 'error', message: result.message });
    } catch (e) {
      setEditTestState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const openEdit = (p: LLMProvider) => {
    setEditingId(p.id);
    setEditBaseURL(p.baseURL ?? '');
    setEditModels(p.models?.join(', ') ?? '');
    setEditApiKey('');
    setEditTestState({ status: 'idle' });
    setError(null);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const modelList = editModels.split(',').map(s => s.trim()).filter(Boolean);
      const updates: Partial<LLMProvider> = { baseURL: editBaseURL.trim() || undefined };
      if (modelList.length) updates.models = modelList;
      if (editApiKey.trim()) updates.apiKey = editApiKey.trim();
      await window.electronAPI.llm.updateProvider(editingId, updates);
      setEditingId(null);
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove provider "${name}"?`)) return;
    setError(null);
    try {
      await window.electronAPI.llm.removeProvider(id);
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to remove provider');
    }
  };

  const handleToggle = async (p: LLMProvider) => {
    setError(null);
    try {
      await window.electronAPI.llm.updateProvider(p.id, { enabled: !p.enabled });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to update provider');
    }
  };

  const handleDefaultChange = async (id: string) => {
    setDefaultProviderId(id);
    setError(null);
    try {
      await window.electronAPI.config.set('defaultLLMProvider', id || undefined);
    } catch (e) {
      console.error(e);
      setError('Failed to set default provider');
    }
  };

  const handleFetchModels = async (p: LLMProvider) => {
    setFetchingModelsId(p.id);
    setError(null);
    try {
      await window.electronAPI.llm.fetchModels(p.id);
      await loadProviders();
      setExpandedModelsId(p.id);
    } catch (e) {
      console.error(e);
      setError('Failed to fetch models');
    } finally {
      setFetchingModelsId(null);
    }
  };

  const handleToggleModel = async (p: LLMProvider, model: string) => {
    const current = p.enabledModels || [];
    const updated = current.includes(model) ? current.filter(m => m !== model) : [...current, model];
    try {
      await window.electronAPI.llm.updateProvider(p.id, { enabledModels: updated });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to update model');
    }
  };

  const renderTestButton = (testState: TestState, onTest: () => void, size: 'sm' | 'default' = 'sm') => {
    const iconSize = size === 'sm' ? 14 : 16;
    if (testState.status === 'testing') {
      return <Button type="button" variant="outline" size={size} disabled><Loader2 size={iconSize} className="animate-spin mr-1" />Testing...</Button>;
    }
    if (testState.status === 'success') {
      return <Button type="button" variant="outline" size={size} className="text-emerald-500 border-emerald-500/30"><CheckCircle size={iconSize} className="mr-1" />{testState.message}</Button>;
    }
    if (testState.status === 'error') {
      return <Button type="button" variant="outline" size={size} className="text-destructive border-destructive/30"><XCircle size={iconSize} className="mr-1" />{testState.message}</Button>;
    }
    return <Button type="button" variant="outline" size={size} onClick={onTest}>Test Connection</Button>;
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button type="button" variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">LLM Providers</h1>
            <p className="text-sm text-muted-foreground">API keys, models, and default provider</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <Label className="shrink-0">Default for Agent chat</Label>
          <Select value={defaultProviderId} onValueChange={handleDefaultChange} disabled={loading || !providers.some(p => p.enabled)}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {!providers.some(p => p.enabled) && <SelectItem value="__none__">—</SelectItem>}
              {providers.filter(p => p.enabled).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.presetId})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!showAdd ? (
          <div className="mb-6">
            <Button type="button" onClick={() => { setShowAdd(true); setSelectedPreset(null); setError(null); }} className="flex items-center gap-2">
              <Plus size={18} /> Add Provider
            </Button>
          </div>
        ) : (
          <Card className="mb-6">
            <CardContent className="pt-4 pb-4 space-y-4">
              <h3 className="font-medium text-foreground">Add Provider</h3>
              {!selectedPreset ? (
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className="p-3 rounded-lg border text-sm text-left transition-colors border-border hover:border-primary/50 hover:bg-primary/5"
                    >
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{preset.moduleType}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleAdd} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    <span className="font-medium">{selectedPreset.label}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPreset(null)}>Change</Button>
                  </div>
                  <div>
                    <Label className="block mb-1.5">Name</Label>
                    <Input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. OpenAI Production" />
                  </div>
                  {selectedPreset.requiresApiKey && (
                    <div>
                      <Label className="block mb-1.5">API Key</Label>
                      <Input type="password" autoComplete="off" value={addApiKey} onChange={e => setAddApiKey(e.target.value)} placeholder="sk-…" />
                    </div>
                  )}
                  {selectedPreset.moduleType !== 'claude-agent-sdk' && (
                    <div>
                      <Label className="block mb-1.5">Base URL</Label>
                      <Input value={addBaseURL} onChange={e => setAddBaseURL(e.target.value)} placeholder={selectedPreset.defaultBaseURL || 'https://api.openai.com/v1'} />
                    </div>
                  )}
                  <div>
                    <Label className="block mb-1.5">Models (comma-separated)</Label>
                    <Input value={addModels} onChange={e => setAddModels(e.target.value)} placeholder="gpt-4, gpt-3.5-turbo" />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    {renderTestButton(addTestState, handleTestAddConnection, 'default')}
                    <div className="flex-1" />
                    <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setSelectedPreset(null); setAddTestState({ status: 'idle' }); }}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading…</div>
        ) : providers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
            <p>No LLM providers yet. Add an API key to get started.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {providers.map(p => (
              <li key={p.id}>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    {editingId === p.id ? (
                      <form onSubmit={handleEditSave} className="space-y-3">
                        {p.moduleType !== 'claude-agent-sdk' && (
                          <div><Label className="block mb-1.5">Base URL</Label><Input value={editBaseURL} onChange={e => setEditBaseURL(e.target.value)} /></div>
                        )}
                        <div><Label className="block mb-1.5">Models (comma-separated)</Label><Input value={editModels} onChange={e => setEditModels(e.target.value)} /></div>
                        {p.moduleType !== 'claude-agent-sdk' && (
                          <div><Label className="block mb-1.5">New API key (optional)</Label><Input type="password" autoComplete="off" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Leave blank to keep current key" /></div>
                        )}
                        <div className="flex items-center gap-2 pt-2">
                          {p.enabled && renderTestButton(editTestState, () => handleTestConnection(p.id))}
                          <div className="flex-1" />
                          <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('w-2 h-2 rounded-full', p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                            <span className="font-medium text-foreground">{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.presetId}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 ml-4">
                            {maskApiKey(p.apiKey)}
                            {p.baseURL && <span className="block truncate mt-1" title={p.baseURL}>{p.baseURL}</span>}
                          </div>
                          {p.models?.length > 0 && (
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-4 hover:text-foreground transition-colors"
                              onClick={() => setExpandedModelsId(expandedModelsId === p.id ? null : p.id)}
                            >
                              <ChevronDown size={12} className={cn(expandedModelsId === p.id && 'rotate-180')} />
                              {p.enabledModels?.length || 0} / {p.models.length} models enabled
                            </button>
                          )}
                          {expandedModelsId === p.id && p.models?.length > 0 && (
                            <div className="mt-2 space-y-1 pl-5">
                              {p.models.map(model => {
                                const isEnabled = (p.enabledModels || []).includes(model);
                                return (
                                  <div key={model} className="flex items-center gap-2">
                                    <Switch checked={isEnabled} onCheckedChange={() => handleToggleModel(p, model)} className="scale-75" />
                                    <span className="text-xs">{model}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleFetchModels(p)} disabled={!p.enabled || fetchingModelsId === p.id} title="Fetch models">
                            <RefreshCw size={16} className={cn(fetchingModelsId === p.id && 'animate-spin')} />
                          </Button>
                          <Label htmlFor={`switch-${p.id}`} className="text-xs text-muted-foreground mr-1">Enabled</Label>
                          <Switch id={`switch-${p.id}`} checked={p.enabled} onCheckedChange={() => handleToggle(p)} />
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit"><Pencil size={16} /></Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemove(p.id, p.name)} title="Remove" className="text-destructive hover:text-destructive"><Trash2 size={16} /></Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
