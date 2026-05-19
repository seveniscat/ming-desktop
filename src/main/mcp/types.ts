export type McpTransportType = 'stdio' | 'sse';

export interface McpServerConfig {
  id?: string;
  name: string;
  transportType: McpTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled?: boolean;
}

export interface McpServerRecord {
  id: string;
  name: string;
  transport_type: McpTransportType;
  command: string | null;
  args: string;
  env: string;
  url: string | null;
  enabled: number;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolRecord {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  input_schema: string | null;
}

export interface McpProtocolLogEntry {
  id: string;
  server_id: string;
  direction: 'sent' | 'received';
  message_type: string;
  method: string | null;
  payload_json: string;
  timestamp: string;
}
