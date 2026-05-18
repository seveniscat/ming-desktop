import { Plus, Trash2, Search, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import { McpTemplates, McpTemplate } from './McpTemplates';
import { DiscoverLinks } from './DiscoverLinks';

interface ServerInfo {
  id: string;
  name: string;
  transport_type: 'stdio' | 'sse';
  status: string;
  enabled: number;
}

interface ServerListProps {
  servers: ServerInfo[];
  selectedId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onImportTemplate: (template: McpTemplate) => void;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'connected':
      return <Wifi size={14} className="text-green-500 shrink-0" />;
    case 'connecting':
      return <Wifi size={14} className="text-yellow-500 shrink-0 animate-pulse" />;
    case 'error':
      return <AlertCircle size={14} className="text-red-500 shrink-0" />;
    default:
      return <WifiOff size={14} className="text-muted-foreground shrink-0" />;
  }
}

export function ServerList({
  servers,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  onAdd,
  onDelete,
  onImportTemplate,
}: ServerListProps) {
  const filtered = servers.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 space-y-3 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">MCP Servers</h2>
          <Button size="sm" onClick={onAdd} className="h-7 gap-1.5">
            <Plus size={14} />
            Add
          </Button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search servers..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <McpTemplates
        onImport={onImportTemplate}
        existingServerNames={servers.map((s) => s.name)}
      />

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {search ? 'No matching servers' : 'No servers configured'}
            </div>
          ) : (
            filtered.map((server) => (
              <div
                key={server.id}
                onClick={() => onSelect(server.id)}
                className={cn(
                  'group w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer',
                  selectedId === server.id
                    ? 'bg-primary/5 border-l-2 border-primary'
                    : 'border-l-2 border-transparent hover:bg-[var(--surface-hover)]'
                )}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={server.status} />
                  <span className="text-sm font-medium truncate flex-1">{server.name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0 uppercase">
                    {server.transport_type}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(server.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                {!server.enabled && (
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">Disabled</p>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <DiscoverLinks />
    </div>
  );
}
