import { useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Folder, Globe, Brain, Search, Lightbulb } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export interface McpTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  transport_type: 'stdio' | 'sse';
  command: string;
  args: string[];
  env: Record<string, string>;
  url?: string;
}

const templates: McpTemplate[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files on your local machine',
    icon: <Folder size={14} />,
    transport_type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '~/Desktop'],
    env: {},
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch web content and make HTTP requests',
    icon: <Globe size={14} />,
    transport_type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    env: {},
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent key-value memory store for context',
    icon: <Brain size={14} />,
    transport_type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search via Brave Search API',
    icon: <Search size={14} />,
    transport_type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: 'your-api-key-here' },
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Dynamic problem-solving through sequential thinking',
    icon: <Lightbulb size={14} />,
    transport_type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    env: {},
  },
];

interface McpTemplatesProps {
  onImport: (template: McpTemplate) => void;
  existingServerNames: string[];
}

export function McpTemplates({ onImport, existingServerNames }: McpTemplatesProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[hsl(var(--border))]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Templates
        <span className="text-[10px] text-muted-foreground/60">({templates.length})</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {templates.map((template) => {
            const alreadyAdded = existingServerNames.some(
              (name) => name.toLowerCase() === template.name.toLowerCase()
            );

            return (
              <div
                key={template.id}
                className={cn(
                  'group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
                  alreadyAdded
                    ? 'opacity-50'
                    : 'hover:bg-[var(--surface-hover)]'
                )}
              >
                <span className="text-muted-foreground shrink-0">{template.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{template.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{template.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-6 px-2 text-[10px] shrink-0',
                    alreadyAdded
                      ? 'opacity-50 cursor-not-allowed'
                      : 'opacity-0 group-hover:opacity-100'
                  )}
                  disabled={alreadyAdded}
                  onClick={() => onImport(template)}
                >
                  {alreadyAdded ? 'Added' : <Plus size={12} />}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { templates };
