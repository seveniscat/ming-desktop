import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
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

  const [sidebarWidth, setSidebarWidth] = useState(300);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    try {
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
    } catch (error) {
      console.error('Failed to create tool:', error);
      alert(`Failed to create tool: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      {/* Left panel: tool list */}
      <div
        className="h-full flex-shrink-0 overflow-hidden border-r border-[hsl(var(--border))]"
        style={{ width: sidebarWidth }}
      >
        <div className="h-full flex flex-col">
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

          <ScrollArea className="flex-1">
            <div className="px-2 pb-2 space-y-0.5">
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
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedId === tool.id
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : 'border-l-2 border-transparent hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{tool.display_name}</span>
                      {!tool.is_enabled && (
                        <Badge variant="outline" className="text-[10px] shrink-0">Disabled</Badge>
                      )}
                      {tool.category && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{tool.category}</Badge>
                      )}
                    </div>
                    {(tool.description || tool.name) && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 text-left">
                        {tool.description || tool.name}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>{tool.usage_count} uses</span>
                      <span>{tool.implementation_type}</span>
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
      </div>
    </div>
  );
}
