import { ExternalLink, Store, Users, ScanSearch, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

const directories = [
  {
    name: 'Smithery',
    description: 'Largest MCP marketplace',
    url: 'https://smithery.ai/',
    icon: <Store size={13} />,
  },
  {
    name: 'mcp.so',
    description: 'Community directory',
    url: 'https://mcp.so/',
    icon: <Users size={13} />,
  },
  {
    name: 'Glama',
    description: 'Comprehensive registry with scoring',
    url: 'https://glama.ai/mcp/servers',
    icon: <ScanSearch size={13} />,
  },
  {
    name: 'MCP Directory',
    description: 'Curated server directory',
    url: 'https://mcp.directory/',
    icon: <LayoutGrid size={13} />,
  },
];

export function DiscoverLinks() {
  const handleOpen = (url: string) => {
    window.electronAPI?.shell?.openExternal(url);
  };

  return (
    <div className="border-t border-[hsl(var(--border))] px-3 py-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
        Discover MCP Servers
      </p>
      <div className="space-y-0.5">
        {directories.map((dir) => (
          <button
            key={dir.name}
            onClick={() => handleOpen(dir.url)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left',
              'hover:bg-[var(--surface-hover)] transition-colors group'
            )}
          >
            <span className="text-muted-foreground shrink-0">{dir.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium">{dir.name}</span>
                <ExternalLink
                  size={9}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{dir.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
