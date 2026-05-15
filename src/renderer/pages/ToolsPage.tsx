import { useState, useEffect, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import type { ToolRecord } from '../../shared/types';
import ToolDetail from '../components/tools/ToolDetail';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'file', label: 'File' },
  { value: 'code', label: 'Code' },
  { value: 'web', label: 'Web' },
  { value: 'system', label: 'System' },
  { value: 'custom', label: 'Custom' },
] as const;

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadTools = useCallback(async () => {
    try {
      const list = await window.electronAPI.tools.list();
      setTools(list || []);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const selectedTool = tools.find((t) => t.id === selectedId) || null;

  const filtered = tools.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.display_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleCreate = async () => {
    const name = `custom-tool-${Date.now().toString(36)}`;
    const id = await window.electronAPI.tools.create({
      name,
      display_name: 'New Tool',
      description: '',
      category: 'custom',
      implementation_type: 'builtin',
    });
    await loadTools();
    setSelectedId(id);
  };

  const handleDelete = async (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    if (!confirm(`Delete tool "${tool.display_name}"?`)) return;
    await window.electronAPI.tools.delete(toolId);
    if (selectedId === toolId) setSelectedId(null);
    await loadTools();
  };

  const handleToggleEnabled = async (tool: ToolRecord) => {
    await window.electronAPI.tools.update(tool.id, { is_enabled: !tool.is_enabled });
    await loadTools();
  };

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left panel: tool list */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
          <div className="h-full flex flex-col border-r border-[hsl(var(--border))]">
            {/* Header */}
            <div className="p-4 space-y-3 border-b border-[hsl(var(--border))]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Tools</h2>
                <Button size="sm" onClick={handleCreate} className="h-8 gap-1.5">
                  <Plus size={14} />
                  New
                </Button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
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

            {/* Tool cards */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {loading ? (
                  <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
                ) : filtered.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    {search || categoryFilter !== 'all' ? 'No matching tools' : 'No tools yet'}
                  </div>
                ) : (
                  filtered.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedId(tool.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedId === tool.id
                          ? 'border-primary bg-primary/5'
                          : 'border-[hsl(var(--border))] hover:border-primary/40 hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{tool.display_name}</span>
                            {!tool.is_enabled && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                Disabled
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {tool.description || tool.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {tool.category && (
                            <Badge variant="secondary" className="text-[10px]">
                              {tool.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>{tool.usage_count} uses</span>
                        <span>{tool.implementation_type}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: detail */}
        <ResizablePanel defaultSize={70} minSize={40}>
          {selectedTool ? (
            <ToolDetail
              tool={selectedTool}
              onUpdate={loadTools}
              onDelete={() => handleDelete(selectedTool.id)}
              onToggleEnabled={() => handleToggleEnabled(selectedTool)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg">Select a tool to view details</p>
                <p className="text-sm mt-1">Or create a new one from the sidebar</p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
