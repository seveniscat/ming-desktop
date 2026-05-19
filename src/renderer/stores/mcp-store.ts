import { create } from 'zustand';

interface McpServer {
  id: string;
  name: string;
  transport_type: 'stdio' | 'sse';
  command: string | null;
  args: string;
  env: string;
  url: string | null;
  enabled: number;
  status: string;
  error_message: string | null;
}

interface McpTool {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  input_schema: string | null;
}

interface McpProtocolLog {
  id: string;
  server_id: string;
  direction: 'sent' | 'received';
  message_type: string;
  method: string | null;
  payload_json: string;
  timestamp: string;
}

interface McpState {
  servers: McpServer[];
  selectedServerId: string | null;
  serverTools: McpTool[];
  protocolLogs: McpProtocolLog[];
  loading: boolean;

  setServers: (servers: McpServer[]) => void;
  setSelectedServerId: (id: string | null) => void;
  setServerTools: (tools: McpTool[]) => void;
  addProtocolLog: (log: McpProtocolLog) => void;
  setProtocolLogs: (logs: McpProtocolLog[]) => void;
  setLoading: (loading: boolean) => void;
  updateServerStatus: (serverId: string, status: string, error?: string) => void;
}

export const useMcpStore = create<McpState>((set) => ({
  servers: [],
  selectedServerId: null,
  serverTools: [],
  protocolLogs: [],
  loading: false,

  setServers: (servers) => set({ servers }),
  setSelectedServerId: (id) => set({ selectedServerId: id, serverTools: [] }),
  setServerTools: (tools) => set({ serverTools: tools }),
  addProtocolLog: (log) => set((state) => ({ protocolLogs: [...state.protocolLogs, log].slice(-1000) })),
  setProtocolLogs: (logs) => set({ protocolLogs: logs.slice(-1000) }),
  setLoading: (loading) => set({ loading }),
  updateServerStatus: (serverId, status, error) => set((state) => ({
    servers: state.servers.map(s =>
      s.id === serverId ? { ...s, status, error_message: error || null } : s
    ),
  })),
}));
