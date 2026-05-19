import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { cn } from '@/lib/utils';

interface ServerConfigData {
  name: string;
  transport_type: 'stdio' | 'sse';
  command: string;
  args: string;
  env: string;
  url: string;
  enabled: boolean;
}

interface ServerConfigFormProps {
  initialData: ServerConfigData;
  onSave: (data: ServerConfigData) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  status: string;
  loading: boolean;
}

export function ServerConfigForm({
  initialData,
  onSave,
  onConnect,
  onDisconnect,
  status,
  loading,
}: ServerConfigFormProps) {
  const [form, setForm] = useState<ServerConfigData>(initialData);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  const handleTransportToggle = (type: 'stdio' | 'sse') => {
    setForm((prev) => ({ ...prev, transport_type: type }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-6 max-w-xl">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="my-server"
          className="h-8 text-sm"
        />
      </div>

      {/* Transport type toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Transport</Label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => handleTransportToggle('stdio')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              form.transport_type === 'stdio'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            STDIO
          </button>
          <button
            type="button"
            onClick={() => handleTransportToggle('sse')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              form.transport_type === 'sse'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            SSE
          </button>
        </div>
      </div>

      {/* Stdio fields */}
      {form.transport_type === 'stdio' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Command</Label>
            <Input
              value={form.command}
              onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
              placeholder="npx"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Arguments (one per line)</Label>
            <Textarea
              value={form.args}
              onChange={(e) => setForm((prev) => ({ ...prev, args: e.target.value }))}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/tmp"}
              className="text-sm font-mono min-h-[80px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Environment Variables (KEY=VALUE per line)</Label>
            <Textarea
              value={form.env}
              onChange={(e) => setForm((prev) => ({ ...prev, env: e.target.value }))}
              placeholder={"API_KEY=abc123\nDEBUG=true"}
              className="text-sm font-mono min-h-[60px]"
            />
          </div>
        </>
      )}

      {/* SSE fields */}
      {form.transport_type === 'sse' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">URL</Label>
          <Input
            value={form.url}
            onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
            placeholder="http://localhost:3000/sse"
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={form.enabled}
          onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
        />
        <Label className="text-sm text-foreground">Enabled</Label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" size="sm" className="h-7" disabled={loading}>
          Save
        </Button>
        {isConnected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onDisconnect}
            disabled={loading}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onConnect}
            disabled={loading || isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>
        )}
      </div>
    </form>
  );
}
