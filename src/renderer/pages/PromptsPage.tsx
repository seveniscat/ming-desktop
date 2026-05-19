import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import type { PromptTemplate } from '../../shared/types';
import PromptDetail from '../components/prompts/PromptDetail';

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'system', label: 'System' },
  { value: 'task', label: 'Task' },
] as const;

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'coding', label: 'Coding' },
  { value: 'writing', label: 'Writing' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'general', label: 'General' },
] as const;

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [sidebarWidth, setSidebarWidth] = useState(300);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadPrompts = useCallback(async () => {
    try {
      const list = await window.electronAPI.prompts.list();
      setPrompts(list || []);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const selectedPrompt = prompts.find((p) => p.id === selectedId) || null;

  const filtered = prompts.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.trigger || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });

  const handleCreate = async () => {
    try {
      const id = await window.electronAPI.prompts.create({
        name: 'New Prompt',
        type: 'task',
        trigger: `prompt-${Date.now().toString(36)}`,
        description: '',
        content: '',
        category: 'general',
        tags: [],
      });
      await loadPrompts();
      setSelectedId(id);
    } catch (error) {
      console.error('Failed to create prompt:', error);
      alert(`Failed to create prompt: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDelete = async (promptId: string) => {
    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) return;
    if (!confirm(`Delete prompt "${prompt.name}"?`)) return;
    await window.electronAPI.prompts.delete(promptId);
    if (selectedId === promptId) setSelectedId(null);
    await loadPrompts();
  };

  const handleToggleEnabled = async (prompt: PromptTemplate) => {
    await window.electronAPI.prompts.update(prompt.id, { enabled: !prompt.enabled });
    await loadPrompts();
  };

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      setSidebarWidth(Math.max(220, Math.min(containerRect.width * 0.45, newWidth)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full flex">
      {/* Left panel: prompt list */}
      <div
        className="h-full flex-shrink-0 overflow-hidden border-r border-[hsl(var(--border))]"
        style={{ width: sidebarWidth }}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 space-y-3 border-b border-[hsl(var(--border))]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Prompts</h2>
              <Button size="sm" onClick={handleCreate} className="h-8 gap-1.5">
                <Plus size={14} />
                New
              </Button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search prompts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            {/* Type filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    typeFilter === t.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoryFilter(cat.value)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    categoryFilter === cat.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-2 pb-2 space-y-0.5">
              {loading ? (
                <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {search || typeFilter !== 'all' || categoryFilter !== 'all' ? 'No matching prompts' : 'No prompts yet'}
                </div>
              ) : (
                filtered.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => setSelectedId(prompt.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedId === prompt.id
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : 'border-l-2 border-transparent hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{prompt.name}</span>
                      <Badge
                        variant={prompt.type === 'system' ? 'default' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {prompt.type}
                      </Badge>
                      {!prompt.enabled && (
                        <Badge variant="outline" className="text-[10px] shrink-0">Disabled</Badge>
                      )}
                    </div>
                    {prompt.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 text-left">
                        {prompt.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span className="font-mono">/{prompt.trigger}</span>
                      {prompt.variables.length > 0 && (
                        <span>{prompt.variables.length} vars</span>
                      )}
                      <span>{prompt.usage_count} uses</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-1 h-full flex-shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Right panel: detail */}
      <div className="flex-1 h-full min-w-0">
        {selectedPrompt ? (
          <PromptDetail
            prompt={selectedPrompt}
            onUpdate={loadPrompts}
            onDelete={() => handleDelete(selectedPrompt.id)}
            onToggleEnabled={() => handleToggleEnabled(selectedPrompt)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Select a prompt to view details</p>
              <p className="text-sm mt-1">Or create a new one from the sidebar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
