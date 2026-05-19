import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Pencil, Trash2, RefreshCw, ChevronDown } from 'lucide-react';
import type { LLMProvider, LLMProviderConfig } from '../../shared/types';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const PROVIDER_TYPES: { value: LLMProvider['type']; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'qwen', label: 'Qwen (通义千问)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'custom', label: 'OpenAI-compatible' },
];

function maskApiKey(key?: string): string {
  if (!key) return '—';
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

const emptyAddForm: LLMProviderConfig = {
  name: '',
  type: 'openai',
  apiKey: '',
  baseURL: '',
  models: [],
};

const emptyEdit: { baseURL: string; modelsStr: string; apiKey: string } = {
  baseURL: '',
  modelsStr: '',
  apiKey: '',
};

export default function LLMConfiguration() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultProviderId, setDefaultProviderId] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<LLMProviderConfig>(emptyAddForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [error, setError] = useState<string | null>(null);
  const [fetchingModelsId, setFetchingModelsId] = useState<string | null>(null);
  const [expandedModelsId, setExpandedModelsId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, def] = await Promise.all([
        window.electronAPI.llm.listProviders(),
        window.electronAPI.config.get('defaultLLMProvider') as Promise<string | undefined>,
      ]);
      setProviders(list);
      const enabled = list.find(p => p.enabled);
      setDefaultProviderId(
        def && list.some(p => p.id === def && p.enabled)
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

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.apiKey?.trim()) {
      setError('Name and API key are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const models = addForm.models?.length
        ? addForm.models
        : undefined;
      const config: LLMProviderConfig = {
        name: addForm.name.trim(),
        type: addForm.type,
        apiKey: addForm.apiKey.trim(),
        baseURL: addForm.baseURL?.trim() || undefined,
        models,
      };
      await window.electronAPI.llm.addProvider(config);
      setShowAdd(false);
      setAddForm(emptyAddForm);
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to add provider');
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
      const def = (await window.electronAPI.config.get('defaultLLMProvider')) as string | undefined;
      setDefaultProviderId(def ?? '');
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

  const openEdit = (p: LLMProvider) => {
    setEditingId(p.id);
    setEditForm({
      baseURL: p.baseURL ?? '',
      modelsStr: p.models?.join(', ') ?? '',
      apiKey: '',
    });
    setError(null);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const modelList = editForm.modelsStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const updates: Partial<LLMProvider> = {
        baseURL: editForm.baseURL.trim() || undefined,
      };
      if (modelList.length) {
        updates.models = modelList;
      }
      if (editForm.apiKey.trim()) {
        updates.apiKey = editForm.apiKey.trim();
      }
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

  const handleDefaultChange = async (id: string) => {
    setDefaultProviderId(id);
    setError(null);
    try {
      if (id) {
        await window.electronAPI.config.set('defaultLLMProvider', id);
      } else {
        await window.electronAPI.config.set('defaultLLMProvider', undefined);
      }
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
    const updated = current.includes(model)
      ? current.filter(m => m !== model)
      : [...current, model];
    try {
      await window.electronAPI.llm.updateProvider(p.id, { enabledModels: updated });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to update model');
    }
  };

  return (
    <div>
      {error && (
        <p className="text-sm text-destructive mb-3" role="alert">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <Label className="shrink-0">Default for Agent chat</Label>
        <Select
          value={defaultProviderId}
          onValueChange={handleDefaultChange}
          disabled={loading || !providers.some(p => p.enabled)}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {!providers.some(p => p.enabled) && (
              <SelectItem value="__none__">—</SelectItem>
            )}
            {providers
              .filter(p => p.enabled)
              .map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end mb-4">
        <Button
          type="button"
          onClick={() => {
            setShowAdd(true);
            setAddForm(emptyAddForm);
            setError(null);
          }}
          className="flex items-center gap-2"
        >
          <Plus size={18} />
          Add provider
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Loading…</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
          <Key size={40} className="mx-auto mb-3 opacity-50" />
          <p>No LLM providers yet. Add an API key to get started.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {providers.map(p => (
            <li key={p.id}>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.type} · {maskApiKey(p.apiKey)}
                        {p.baseURL && (
                          <span className="block truncate mt-1" title={p.baseURL}>
                            {p.baseURL}
                          </span>
                        )}
                      </div>
                      {p.models?.length > 0 && (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-muted-foreground mt-1 hover:text-foreground transition-colors"
                          onClick={() => setExpandedModelsId(expandedModelsId === p.id ? null : p.id)}
                        >
                          <ChevronDown
                            size={12}
                            className={cn(expandedModelsId === p.id && 'rotate-180')}
                          />
                          {p.enabledModels?.length || 0} / {p.models.length} models enabled
                        </button>
                      )}
                      {expandedModelsId === p.id && p.models?.length > 0 && (
                        <div className="mt-2 space-y-1 pl-1">
                          {p.models.map(model => {
                            const isEnabled = (p.enabledModels || []).includes(model);
                            return (
                              <div key={model} className="flex items-center gap-2">
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => handleToggleModel(p, model)}
                                  className="scale-75"
                                />
                                <span className="text-xs">{model}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleFetchModels(p)}
                        disabled={!p.enabled || fetchingModelsId === p.id}
                        title="Fetch models"
                      >
                        <RefreshCw size={16} className={cn(fetchingModelsId === p.id && 'animate-spin')} />
                      </Button>
                      <Label htmlFor={`switch-${p.id}`} className="text-xs text-muted-foreground mr-1">Enabled</Label>
                      <Switch
                        id={`switch-${p.id}`}
                        checked={p.enabled}
                        onCheckedChange={() => handleToggle(p)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(p)}
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(p.id, p.name)}
                        title="Remove"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Add Provider Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label className="block mb-1.5">Name</Label>
              <Input
                value={addForm.name}
                onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. OpenAI Production"
              />
            </div>
            <div>
              <Label className="block mb-1.5">Type</Label>
              <Select
                value={addForm.type}
                onValueChange={val =>
                  setAddForm({ ...addForm, type: val as LLMProvider['type'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block mb-1.5">API key</Label>
              <Input
                type="password"
                autoComplete="off"
                value={addForm.apiKey ?? ''}
                onChange={e => setAddForm({ ...addForm, apiKey: e.target.value })}
                placeholder="sk-…"
              />
            </div>
            <div>
              <Label className="block mb-1.5">Base URL (optional)</Label>
              <Input
                value={addForm.baseURL ?? ''}
                onChange={e => setAddForm({ ...addForm, baseURL: e.target.value })}
                placeholder={
                  addForm.type === 'anthropic'
                    ? 'https://api.anthropic.com'
                    : addForm.type === 'qwen'
                      ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
                      : addForm.type === 'deepseek'
                        ? 'https://api.deepseek.com/v1'
                        : 'https://api.openai.com/v1'
                }
              />
            </div>
            <div>
              <Label className="block mb-1.5">Models (optional)</Label>
              <Input
                value={addForm.models?.join(', ') ?? ''}
                onChange={e =>
                  setAddForm({
                    ...addForm,
                    models: e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="First model is used for chat, e.g. gpt-4, gpt-3.5-turbo"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Provider Dialog */}
      <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit provider</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div>
              <Label className="block mb-1.5">Base URL</Label>
              <Input
                value={editForm.baseURL}
                onChange={e => setEditForm({ ...editForm, baseURL: e.target.value })}
              />
            </div>
            <div>
              <Label className="block mb-1.5">Models (comma-separated)</Label>
              <Input
                value={editForm.modelsStr}
                onChange={e => setEditForm({ ...editForm, modelsStr: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">The first model is used for API calls.</p>
            </div>
            <div>
              <Label className="block mb-1.5">New API key (optional)</Label>
              <Input
                type="password"
                autoComplete="off"
                value={editForm.apiKey}
                onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })}
                placeholder="Leave blank to keep current key"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingId(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
