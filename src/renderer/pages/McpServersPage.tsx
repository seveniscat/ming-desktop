import { useState, useEffect, useCallback, useRef } from 'react';
import { useMcpStore } from '../stores/mcp-store';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { ServerList } from '../components/mcp/ServerList';
import { ServerConfigForm } from '../components/mcp/ServerConfigForm';
import { ServerTools } from '../components/mcp/ServerTools';
import { ServerToolTest } from '../components/mcp/ServerToolTest';

const api = window.electronAPI?.mcpServers;

interface ServerFormData {
  name: string;
  transport_type: 'stdio' | 'sse';
  command: string;
  args: string;
  env: string;
  url: string;
  enabled: boolean;
}

function serverToFormData(server: any): ServerFormData {
  let args = '';
  try {
    const parsed = JSON.parse(server.args || '[]');
    args = Array.isArray(parsed) ? parsed.join('\n') : '';
  } catch {
    args = server.args || '';
  }

  let env = '';
  try {
    const parsed = JSON.parse(server.env || '{}');
    env = typeof parsed === 'object' && parsed !== null
      ? Object.entries(parsed).map(([k, v]) => `${k}=${v}`).join('\n')
      : '';
  } catch {
    env = server.env || '';
  }

  return {
    name: server.name || '',
    transport_type: server.transport_type || 'stdio',
    command: server.command || '',
    args,
    env,
    url: server.url || '',
    enabled: !!server.enabled,
  };
}

export default function McpServersPage() {
  const {
    servers,
    selectedServerId,
    serverTools,
    loading,
    setServers,
    setSelectedServerId,
    setServerTools,
    setLoading,
    updateServerStatus,
  } = useMcpStore();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('config');
  const [isAddMode, setIsAddMode] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load server list
  const loadServers = useCallback(async () => {
    if (!api) return;
    try {
      setLoading(true);
      const list = await api.list();
      setServers(list || []);
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    } finally {
      setLoading(false);
    }
  }, [setServers, setLoading]);

  // Load tools for a connected server
  const loadTools = useCallback(
    async (serverId: string) => {
      if (!api) return;
      const server = servers.find((s) => s.id === serverId);
      if (!server || server.status !== 'connected') {
        setServerTools([]);
        return;
      }
      try {
        const tools = await api.refreshTools(serverId);
        setServerTools(tools || []);
      } catch (error) {
        console.error('Failed to load tools:', error);
        setServerTools([]);
      }
    },
    [servers, setServerTools]
  );

  // Initial load
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Subscribe to status changes
  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onStatusChange((data: any) => {
      updateServerStatus(data.id, data.status, data.error);
    });
    return unsubscribe;
  }, [updateServerStatus]);

  // Load tools when selected server changes
  useEffect(() => {
    if (selectedServerId) {
      loadTools(selectedServerId);
    } else {
      setServerTools([]);
    }
  }, [selectedServerId, loadTools, setServerTools]);

  const selectedServer = servers.find((s) => s.id === selectedServerId) || null;

  // -- Handlers --

  const handleSelect = (id: string) => {
    setIsAddMode(false);
    setSelectedServerId(id);
    setActiveTab('config');
  };

  const handleAdd = () => {
    setIsAddMode(true);
    setSelectedServerId(null);
    setActiveTab('config');
  };

  const handleDelete = async (serverId: string) => {
    if (!api) return;
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;
    if (!confirm(`Delete server "${server.name}"?`)) return;
    try {
      await api.delete(serverId);
      if (selectedServerId === serverId) {
        setSelectedServerId(null);
      }
      await loadServers();
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  const handleSaveNew = async (data: ServerFormData) => {
    if (!api) return;
    try {
      const parsedArgs = data.args
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const parsedEnv: Record<string, string> = {};
      for (const line of data.env.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          parsedEnv[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
        }
      }
      const id = await api.create({
        name: data.name,
        transportType: data.transport_type,
        command: data.command || null,
        args: parsedArgs,
        env: parsedEnv,
        url: data.url || null,
        enabled: data.enabled ? true : false,
      });
      setIsAddMode(false);
      await loadServers();
      setSelectedServerId(id);
    } catch (error) {
      console.error('Failed to create server:', error);
      alert(`Failed to create server: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSaveExisting = async (data: ServerFormData) => {
    if (!api || !selectedServerId) return;
    try {
      const parsedArgs = data.args
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const parsedEnv: Record<string, string> = {};
      for (const line of data.env.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          parsedEnv[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
        }
      }
      await api.update(selectedServerId, {
        name: data.name,
        transportType: data.transport_type,
        command: data.command || null,
        args: parsedArgs,
        env: parsedEnv,
        url: data.url || null,
        enabled: data.enabled ? true : false,
      });
      await loadServers();
    } catch (error) {
      console.error('Failed to update server:', error);
      alert(`Failed to update server: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleConnect = async () => {
    if (!api || !selectedServerId) return;
    try {
      await api.connect(selectedServerId);
      await loadServers();
    } catch (error) {
      console.error('Failed to connect:', error);
      alert(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDisconnect = async () => {
    if (!api || !selectedServerId) return;
    try {
      await api.disconnect(selectedServerId);
      setServerTools([]);
      await loadServers();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const handleRefreshTools = async () => {
    if (!selectedServerId) return;
    await loadTools(selectedServerId);
  };

  const handleCallTool = async (toolName: string, args: Record<string, unknown>) => {
    if (!api || !selectedServerId) {
      throw new Error('No server selected');
    }
    return api.callTool(selectedServerId, toolName, args);
  };

  // -- Resize handle --
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      setSidebarWidth(Math.max(200, Math.min(containerRect.width * 0.4, newWidth)));
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

  // -- Render --

  const showDetail = isAddMode || selectedServer;

  return (
    <div ref={containerRef} className="h-full w-full flex">
      {/* Left panel: server list */}
      <div
        className="h-full flex-shrink-0 overflow-hidden border-r border-[hsl(var(--border))]"
        style={{ width: sidebarWidth }}
      >
        <ServerList
          servers={servers}
          selectedId={isAddMode ? null : selectedServerId}
          search={search}
          onSearchChange={setSearch}
          onSelect={handleSelect}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />
      </div>

      {/* Resize handle */}
      <div
        className="w-1 h-full flex-shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Right panel: detail */}
      <div className="flex-1 h-full min-w-0">
        {showDetail ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-6 pt-4 border-b border-[hsl(var(--border))]">
              <h3 className="text-sm font-medium text-foreground mb-3">
                {isAddMode ? 'New Server' : selectedServer?.name || 'Server'}
              </h3>
              <TabsList className="h-8">
                <TabsTrigger value="config" className="text-xs h-6 px-3">
                  Config
                </TabsTrigger>
                {!isAddMode && (
                  <>
                    <TabsTrigger
                      value="tools"
                      className="text-xs h-6 px-3"
                      disabled={selectedServer?.status !== 'connected'}
                    >
                      Tools
                    </TabsTrigger>
                    <TabsTrigger
                      value="test"
                      className="text-xs h-6 px-3"
                      disabled={selectedServer?.status !== 'connected'}
                    >
                      Test
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            <TabsContent value="config" className="flex-1 overflow-auto">
              {isAddMode ? (
                <ServerConfigForm
                  initialData={{
                    name: '',
                    transport_type: 'stdio',
                    command: '',
                    args: '',
                    env: '',
                    url: '',
                    enabled: true,
                  }}
                  onSave={handleSaveNew}
                  onConnect={() => {}}
                  onDisconnect={() => {}}
                  status="disconnected"
                  loading={loading}
                />
              ) : selectedServer ? (
                <ServerConfigForm
                  key={selectedServer.id}
                  initialData={serverToFormData(selectedServer)}
                  onSave={handleSaveExisting}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  status={selectedServer.status}
                  loading={loading}
                />
              ) : null}
            </TabsContent>

            {!isAddMode && (
              <>
                <TabsContent value="tools" className="flex-1 overflow-hidden">
                  <ServerTools
                    tools={serverTools}
                    onRefresh={handleRefreshTools}
                    loading={loading}
                  />
                </TabsContent>

                <TabsContent value="test" className="flex-1 overflow-hidden">
                  <ServerToolTest tools={serverTools} onCallTool={handleCallTool} />
                </TabsContent>
              </>
            )}
          </Tabs>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Select a server to view details</p>
              <p className="text-sm mt-1">Or add a new MCP server from the sidebar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
