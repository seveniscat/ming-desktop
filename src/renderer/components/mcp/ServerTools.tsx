import { useState } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';

interface ToolInfo {
  id: string;
  name: string;
  description: string | null;
  input_schema: string | null;
}

interface ServerToolsProps {
  tools: ToolInfo[];
  onRefresh: () => void;
  loading: boolean;
}

function SchemaViewer({ schemaJson }: { schemaJson: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!schemaJson) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(schemaJson);
  } catch {
    return <pre className="text-xs text-destructive mt-1.5">Invalid JSON schema</pre>;
  }

  const properties = parsed.properties || {};
  const required = parsed.required || [];
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground mt-1.5">No input parameters</p>;
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight size={12} className={cn('transition-transform', expanded && 'rotate-90')} />
        Input Schema ({entries.length} {entries.length === 1 ? 'field' : 'fields'})
      </button>
      {expanded && (
        <div className="mt-1.5 ml-4 p-2 rounded-md bg-muted/50 border border-[hsl(var(--border))]">
          {entries.map(([key, value]: [string, any]) => (
            <div key={key} className="flex items-start gap-2 text-xs py-0.5">
              <code className="font-mono text-primary font-medium">{key}</code>
              <span className="text-muted-foreground">
                {value.type || 'any'}
                {required.includes(key) && <span className="text-destructive"> *</span>}
              </span>
              {value.description && (
                <span className="text-muted-foreground truncate">- {value.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ServerTools({ tools, onRefresh, loading }: ServerToolsProps) {
  if (tools.length === 0 && !loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No tools discovered.</p>
          <p className="text-xs mt-1">Connect to the server first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-[hsl(var(--border))]">
        <span className="text-xs text-muted-foreground">
          {loading ? 'Loading tools...' : `${tools.length} tool${tools.length !== 1 ? 's' : ''}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="p-3 rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)]"
            >
              <code className="text-sm font-mono font-medium text-foreground">{tool.name}</code>
              {tool.description && (
                <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
              )}
              <SchemaViewer schemaJson={tool.input_schema} />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
