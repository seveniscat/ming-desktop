import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Brain,
  Plus,
  Search,
  Archive,
  Edit3,
  Eye,
  RotateCcw,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'profile', label: 'Profile' },
  { value: 'preference', label: 'Preference' },
  { value: 'context', label: 'Context' },
  { value: 'custom', label: 'Custom' },
] as const;

const SOURCES = [
  { value: 'all', label: 'All' },
  { value: 'manual', label: 'Manual' },
  { value: 'agent_suggested', label: 'Agent' },
] as const;

const categoryColors: Record<string, string> = {
  profile: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  preference: 'bg-purple-500/15 text-purple-500 border-purple-500/20',
  context: 'bg-green-500/15 text-green-500 border-green-500/20',
  custom: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState<{ text: string; tokens: number } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [recallQuery, setRecallQuery] = useState('');
  const [recallResults, setRecallResults] = useState<any[] | null>(null);
  const [recallSearching, setRecallSearching] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(360);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadMemories = useCallback(async () => {
    try {
      const list = await window.electronAPI.memories.list({ status: 'all' });
      setMemories(list || []);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    try {
      const result = await window.electronAPI.memories.preview();
      setPreview(result);
    } catch (error) {
      console.error('Failed to load preview:', error);
    }
  }, []);

  useEffect(() => {
    loadMemories();
    loadPreview();
  }, [loadMemories, loadPreview]);

  // Refresh preview when memories change
  useEffect(() => {
    loadPreview();
  }, [memories, loadPreview]);

  // FTS5 recall search
  useEffect(() => {
    if (!recallQuery.trim()) {
      setRecallResults(null);
      return;
    }
    setRecallSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await window.electronAPI.memories.search(recallQuery.trim(), 10);
        setRecallResults(results || []);
      } catch (error) {
        console.error('Recall search failed:', error);
        setRecallResults([]);
      } finally {
        setRecallSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [recallQuery]);

  const selectedMemory = memories.find((m) => m.id === selectedId) || null;

  const filtered = useMemo(() => {
    return memories.filter((m) => {
      const matchesSearch =
        !search || m.content.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === 'all' || m.category === categoryFilter;
      const matchesSource =
        sourceFilter === 'all' || m.source === sourceFilter;
      const matchesStatus = showArchived || m.status !== 'archived';
      return matchesSearch && matchesCategory && matchesSource && matchesStatus;
    });
  }, [memories, search, categoryFilter, sourceFilter, showArchived]);

  const activeMemories = useMemo(
    () => memories.filter((m) => m.status !== 'archived'),
    [memories]
  );

  // Dialog helpers
  const openCreate = () => {
    setFormContent('');
    setFormCategory('profile');
    setEditId(null);
    setCreateOpen(true);
  };

  const openEdit = (memory: any) => {
    setFormContent(memory.content);
    setFormCategory(memory.category || 'profile');
    setEditId(memory.id);
    setCreateOpen(true);
  };

  const handleSave = async () => {
    if (!formContent.trim()) return;
    try {
      if (editId) {
        await window.electronAPI.memories.update(editId, {
          content: formContent.trim(),
          category: formCategory,
        });
      } else {
        await window.electronAPI.memories.create({
          content: formContent.trim(),
          category: formCategory,
        });
      }
      setCreateOpen(false);
      await loadMemories();
    } catch (error) {
      console.error('Failed to save memory:', error);
    }
  };

  const handleArchive = async (memory: any) => {
    try {
      await window.electronAPI.memories.update(memory.id, {
        status: memory.status === 'archived' ? 'active' : 'archived',
      });
      await loadMemories();
    } catch (error) {
      console.error('Failed to archive memory:', error);
    }
  };

  const handleDelete = async (memoryId: string) => {
    if (!confirm('Delete this memory?')) return;
    try {
      await window.electronAPI.memories.delete(memoryId);
      if (selectedId === memoryId) setSelectedId(null);
      await loadMemories();
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  };

  // Draggable resize handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      setSidebarWidth(Math.max(280, Math.min(containerRect.width * 0.5, newWidth)));
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

  const dialogTitle = editId ? 'Edit Memory' : 'New Memory';

  return (
    <div ref={containerRef} className="h-full w-full flex">
      {/* Left panel: memory list */}
      <div
        className="h-full flex-shrink-0 overflow-hidden border-r border-[hsl(var(--border))]"
        style={{ width: sidebarWidth }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 space-y-3 border-b border-[hsl(var(--border))]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Memories</h2>
              </div>
              <Button size="sm" onClick={openCreate} className="h-8 gap-1.5">
                <Plus size={14} />
                New
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search memories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((src) => (
                    <SelectItem key={src.value} value={src.value}>
                      {src.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show archived toggle */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-input"
              />
              Show archived
            </label>
          </div>

          {/* Memory list */}
          <ScrollArea className="flex-1">
            <div className="px-2 pb-2 space-y-0.5">
              {loading ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Loading...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {search || categoryFilter !== 'all' || sourceFilter !== 'all'
                    ? 'No matching memories'
                    : 'No memories yet'}
                </div>
              ) : (
                filtered.map((memory) => (
                  <div
                    key={memory.id}
                    onClick={() => setSelectedId(memory.id)}
                    className={`group relative w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                      selectedId === memory.id
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : 'border-l-2 border-transparent hover:bg-[var(--surface-hover)]'
                    } ${memory.status === 'archived' ? 'opacity-50' : ''}`}
                  >
                    <p className="text-sm leading-relaxed line-clamp-3 pr-16">
                      {memory.content}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {memory.category && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium ${
                            categoryColors[memory.category] || categoryColors.custom
                          }`}
                        >
                          {memory.category}
                        </span>
                      )}
                      {memory.source === 'agent_suggested' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0 text-[10px] font-medium text-primary">
                          <Sparkles size={9} />
                          agent
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {memory.updated_at
                          ? relativeTime(memory.updated_at)
                          : memory.created_at
                          ? relativeTime(memory.created_at)
                          : ''}
                      </span>
                    </div>

                    {/* Hover actions */}
                    <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(memory);
                        }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(memory);
                        }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title={memory.status === 'archived' ? 'Unarchive' : 'Archive'}
                      >
                        {memory.status === 'archived' ? <RotateCcw size={12} /> : <Archive size={12} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(memory.id);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
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

      {/* Right panel: preview & debug */}
      <div className="flex-1 h-full min-w-0">
        {selectedMemory ? (
          <div className="h-full flex flex-col">
            {/* Selected memory header */}
            <div className="p-4 border-b border-[hsl(var(--border))] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedMemory.category && (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        categoryColors[selectedMemory.category] || categoryColors.custom
                      }`}
                    >
                      {selectedMemory.category}
                    </span>
                  )}
                  {selectedMemory.source === 'agent_suggested' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      <Sparkles size={10} />
                      Agent suggested
                    </span>
                  )}
                  {selectedMemory.status === 'archived' && (
                    <Badge variant="outline" className="text-[10px]">
                      Archived
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => openEdit(selectedMemory)}
                  >
                    <Edit3 size={12} className="mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleArchive(selectedMemory)}
                  >
                    {selectedMemory.status === 'archived' ? (                      <RotateCcw size={12} className="mr-1" />
                    ) : (
                      <Archive size={12} className="mr-1" />
                    )}
                    {selectedMemory.status === 'archived' ? 'Unarchive' : 'Archive'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(selectedMemory.id)}
                  >
                    <Trash2 size={12} className="mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Created {selectedMemory.created_at ? new Date(selectedMemory.created_at).toLocaleString() : 'unknown'}
                {selectedMemory.updated_at && (
                  <> &middot; Updated {new Date(selectedMemory.updated_at).toLocaleString()}</>
                )}
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedMemory.content}</p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="preview" className="h-full flex flex-col">
            <div className="px-4 pt-4 pb-0">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="preview" className="gap-1.5 text-xs">
                    <Eye size={13} />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="recall" className="gap-1.5 text-xs">
                    <Brain size={13} />
                    Recall Test
                  </TabsTrigger>
                </TabsList>
                {preview && (
                  <span className="text-xs text-muted-foreground">
                    {preview.tokens} tokens
                  </span>
                )}
              </div>
            </div>

            <TabsContent value="preview" className="flex-1 overflow-auto px-4 pb-4 mt-0">
              {preview ? (
                preview.text ? (
                  <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono bg-[var(--surface)] rounded-lg p-4 border border-[hsl(var(--border))]">
                    {preview.text}
                  </pre>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Brain size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No active memories to preview</p>
                      <p className="text-xs mt-1">Create a memory to see the injected prompt</p>
                    </div>
                  </div>
                )
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Loading preview...
                </div>
              )}
            </TabsContent>

            <TabsContent value="recall" className="flex-1 overflow-hidden flex flex-col px-4 pb-4 mt-0">
              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Type to test FTS5 recall..."
                    value={recallQuery}
                    onChange={(e) => setRecallQuery(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-1.5">
                    {(recallResults !== null ? recallResults : activeMemories).length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        {recallQuery.trim() ? 'No matching memories' : 'No active memories'}
                      </div>
                    ) : (
                      (recallResults !== null ? recallResults : activeMemories).map((memory) => (
                        <div
                          key={memory.id}
                          className="rounded-lg border border-[hsl(var(--border))] p-3 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            {memory.category && (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium ${
                                  categoryColors[memory.category] || categoryColors.custom
                                }`}
                              >
                                {memory.category}
                              </span>
                            )}
                            {memory.source === 'agent_suggested' && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
                                <Sparkles size={8} />
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {memory.updated_at
                                ? relativeTime(memory.updated_at)
                                : memory.created_at
                                ? relativeTime(memory.created_at)
                                : ''}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed line-clamp-2">{memory.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="text-xs text-muted-foreground pt-1">
                  {recallSearching
                    ? 'Searching...'
                    : recallResults !== null
                      ? `${recallResults.length} results for "${recallQuery.trim()}"`
                      : `${activeMemories.length} active memories (type to search)`}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Content</label>
              <Textarea
                placeholder="What should the agent remember?"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={4}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Category</label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">Profile</SelectItem>
                  <SelectItem value="preference">Preference</SelectItem>
                  <SelectItem value="context">Context</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="text-sm">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formContent.trim()} className="text-sm">
              {editId ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
