# MCP Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Model Context Protocol (MCP) support with two nav tabs — MCP Servers (config/manage) and MCP Debug (protocol trace).

**Architecture:** MCPManager service on main process handles CRUD, connections (stdio + SSE), and protocol logging. Renderer has two pages served by Zustand store + IPC. Follows existing patterns (SkillManager, ToolsPage, DebugPanel).

**Tech Stack:** @modelcontextprotocol/sdk, better-sqlite3, React, Zustand, shadcn/ui, Tailwind CSS

---

### Task 1: Install MCP SDK

**Files:**
- Modify: `package.json`

**Step 1: Install the MCP SDK**

Run: `npm install @modelcontextprotocol/sdk`

**Step 2: Verify installation**

Run: `npm ls @modelcontextprotocol/sdk`
Expected: version listed without errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: Add IPC Channels

**Files:**
- Modify: `src/shared/ipc-channels.ts` (after line 106)

**Step 1: Add MCP IPC channel definitions**

Append to the `IPCChannels` enum after the `TOOL_APPROVAL_RESPONSE` entry:

```typescript
  // MCP Server 相关
  MCP_SERVER_LIST = 'mcp-server:list',
  MCP_SERVER_GET = 'mcp-server:get',
  MCP_SERVER_CREATE = 'mcp-server:create',
  MCP_SERVER_UPDATE = 'mcp-server:update',
  MCP_SERVER_DELETE = 'mcp-server:delete',
  MCP_SERVER_CONNECT = 'mcp-server:connect',
  MCP_SERVER_DISCONNECT = 'mcp-server:disconnect',
  MCP_SERVER_REFRESH_TOOLS = 'mcp-server:refresh-tools',
  MCP_SERVER_CALL_TOOL = 'mcp-server:call-tool',
  MCP_SERVER_STATUS_EVENT = 'mcp-server:status-event',
  MCP_SERVER_TOOLS_EVENT = 'mcp-server:tools-event',

  // MCP Debug 相关
  MCP_DEBUG_LOGS = 'mcp-debug:logs',
  MCP_DEBUG_CLEAR = 'mcp-debug:clear',
  MCP_DEBUG_EXPORT = 'mcp-debug:export',
  MCP_DEBUG_LOG_EVENT = 'mcp-debug:log-event',
```

**Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(mcp): add IPC channel definitions"
```

---

### Task 3: Add Database Migration

**Files:**
- Modify: `src/main/database/schema.ts` (after line 356, before the closing `}`)

**Step 1: Add MCP tables migration**

Append a new migration block after the `add-user-identities` migration (line 356):

```typescript
  // Migration: add MCP tables
  const migration13Name = 'add-mcp-tables';
  const applied13 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration13Name);
  if (!applied13) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'sse')),
        command TEXT,
        args TEXT DEFAULT '[]',
        env TEXT DEFAULT '{}',
        url TEXT,
        enabled INTEGER DEFAULT 1,
        status TEXT DEFAULT 'disconnected',
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS mcp_tools (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        input_schema TEXT,
        FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mcp_protocol_log (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
        message_type TEXT NOT NULL,
        method TEXT,
        payload_json TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_protocol_log_server ON mcp_protocol_log(server_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_mcp_protocol_log_type ON mcp_protocol_log(message_type);
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration13Name);
  }
```

**Step 2: Verify the app starts without errors**

Run: `npm run dev`
Expected: App launches, no migration errors in console

**Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat(mcp): add database migration for MCP tables"
```

---

### Task 4: Create MCP Types

**Files:**
- Create: `src/main/mcp/types.ts`

**Step 1: Create the types file**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/main/mcp/types.ts
git commit -m "feat(mcp): add MCP type definitions"
```

---

### Task 5: Create MCP Client Wrapper

**Files:**
- Create: `src/main/mcp/McpClient.ts`

**Step 1: Create the MCP client that wraps the SDK**

This client handles connecting to both stdio and SSE MCP servers using the official SDK, and logs all protocol messages.

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpTransportType, McpProtocolLogEntry } from './types';
import { getDatabase } from '../database/connection';
import { randomUUID } from 'crypto';

type LogCallback = (entry: McpProtocolLogEntry) => void;

export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private serverId: string;
  private onLog: LogCallback;
  private _status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private _errorMessage: string | null = null;

  get status() { return this._status; }
  get errorMessage() { return this._errorMessage; }

  constructor(serverId: string, onLog: LogCallback) {
    this.serverId = serverId;
    this.onLog = onLog;
  }

  async connectStdio(command: string, args: string[], env: Record<string, string>): Promise<void> {
    this._status = 'connecting';
    this._errorMessage = null;

    try {
      this.transport = new StdioClientTransport({
        command,
        args,
        env: { ...process.env, ...env } as Record<string, string>,
      });

      this.client = new Client(
        { name: 'ming-desktop', version: '0.1.0' },
        { capabilities: {} }
      );

      this.client.onerror = (error) => {
        this._status = 'error';
        this._errorMessage = error.message || String(error);
      };

      await this.client.connect(this.transport);

      this.logProtocol('sent', 'initialize', 'initialize', { command, args });
      this.logProtocol('received', 'initialized', 'initialized', { capabilities: this.client.getServerCapabilities() });

      this._status = 'connected';
    } catch (error) {
      this._status = 'error';
      this._errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async connectSSE(url: string): Promise<void> {
    this._status = 'connecting';
    this._errorMessage = null;

    try {
      this.transport = new SSEClientTransport(new URL(url));

      this.client = new Client(
        { name: 'ming-desktop', version: '0.1.0' },
        { capabilities: {} }
      );

      this.client.onerror = (error) => {
        this._status = 'error';
        this._errorMessage = error.message || String(error);
      };

      await this.client.connect(this.transport);

      this.logProtocol('sent', 'initialize', 'initialize', { url });
      this.logProtocol('received', 'initialized', 'initialized', { capabilities: this.client.getServerCapabilities() });

      this._status = 'connected';
    } catch (error) {
      this._status = 'error';
      this._errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async listTools() {
    if (!this.client) throw new Error('Client not connected');
    this.logProtocol('sent', 'request', 'tools/list', {});
    const result = await this.client.listTools();
    this.logProtocol('received', 'response', 'tools/list', result);
    return result;
  }

  async callTool(name: string, args: Record<string, unknown>) {
    if (!this.client) throw new Error('Client not connected');
    this.logProtocol('sent', 'request', `tools/call`, { name, arguments: args });
    const result = await this.client.callTool({ name, arguments: args });
    this.logProtocol('received', 'response', `tools/call`, result);
    return result;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.transport = null;
    this._status = 'disconnected';
    this._errorMessage = null;
  }

  private logProtocol(direction: 'sent' | 'received', messageType: string, method: string, payload: unknown) {
    const entry: McpProtocolLogEntry = {
      id: randomUUID(),
      server_id: this.serverId,
      direction,
      message_type: messageType,
      method,
      payload_json: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
    };

    const db = getDatabase();
    db.prepare(`
      INSERT INTO mcp_protocol_log (id, server_id, direction, message_type, method, payload_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.server_id, entry.direction, entry.message_type, entry.method, entry.payload_json, entry.timestamp);

    this.onLog(entry);
  }
}
```

**Step 2: Commit**

```bash
git add src/main/mcp/McpClient.ts
git commit -m "feat(mcp): add MCP client wrapper with stdio and SSE support"
```

---

### Task 6: Create MCPManager Service

**Files:**
- Create: `src/main/mcp/MCPManager.ts`

**Step 1: Create the MCPManager service**

Follows the same pattern as SkillManager — EventEmitter, SQLite CRUD, and IPC handlers.

```typescript
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { getDatabase } from '../database/connection';
import { McpClient } from './McpClient';
import type { McpServerConfig, McpServerRecord, McpToolRecord, McpProtocolLogEntry } from './types';

export class MCPManager extends EventEmitter {
  private clients: Map<string, McpClient> = new Map();

  async initialize(): Promise<void> {
    const db = getDatabase();
    const servers = db.prepare('SELECT * FROM mcp_servers WHERE enabled = 1').all() as McpServerRecord[];
    for (const server of servers) {
      this.autoConnect(server).catch(() => {});
    }
  }

  listServers(): McpServerRecord[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as McpServerRecord[];
  }

  getServer(serverId: string): McpServerRecord | undefined {
    const db = getDatabase();
    return db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId) as McpServerRecord | undefined;
  }

  createServer(config: McpServerConfig): string {
    const db = getDatabase();
    const id = `mcp-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO mcp_servers (id, name, transport_type, command, args, env, url, enabled, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', ?, ?)
    `).run(
      id,
      config.name.trim(),
      config.transportType,
      config.command || null,
      JSON.stringify(config.args || []),
      JSON.stringify(config.env || {}),
      config.url || null,
      config.enabled !== false ? 1 : 0,
      now,
      now
    );

    this.emit('server-created', { id });
    return id;
  }

  updateServer(serverId: string, updates: Partial<McpServerConfig>): void {
    const db = getDatabase();
    const existing = this.getServer(serverId);
    if (!existing) throw new Error(`Server ${serverId} not found`);

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name.trim()); }
    if (updates.transportType !== undefined) { fields.push('transport_type = ?'); values.push(updates.transportType); }
    if (updates.command !== undefined) { fields.push('command = ?'); values.push(updates.command); }
    if (updates.args !== undefined) { fields.push('args = ?'); values.push(JSON.stringify(updates.args)); }
    if (updates.env !== undefined) { fields.push('env = ?'); values.push(JSON.stringify(updates.env)); }
    if (updates.url !== undefined) { fields.push('url = ?'); values.push(updates.url); }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(serverId);
    db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // Disconnect if currently connected — config changed
    this.disconnectServer(serverId).catch(() => {});

    this.emit('server-updated', { id: serverId });
  }

  deleteServer(serverId: string): void {
    const db = getDatabase();
    this.disconnectServer(serverId).catch(() => {});
    db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(serverId);
    db.prepare('DELETE FROM mcp_tools WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM mcp_protocol_log WHERE server_id = ?').run(serverId);
    this.emit('server-deleted', { id: serverId });
  }

  async connectServer(serverId: string): Promise<void> {
    const server = this.getServer(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);

    // Disconnect existing client if any
    await this.disconnectServer(serverId);

    const client = new McpClient(serverId, (entry) => {
      this.emit('protocol-log', entry);
    });

    this.clients.set(serverId, client);

    const db = getDatabase();
    try {
      this.updateStatus(serverId, 'connecting');

      if (server.transport_type === 'stdio') {
        await client.connectStdio(
          server.command || '',
          JSON.parse(server.args || '[]'),
          JSON.parse(server.env || '{}')
        );
      } else {
        await client.connectSSE(server.url || '');
      }

      this.updateStatus(serverId, 'connected');
      await this.refreshTools(serverId);
      this.emit('server-status', { id: serverId, status: 'connected' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.updateStatus(serverId, 'error', msg);
      this.emit('server-status', { id: serverId, status: 'error', error: msg });
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }
    this.updateStatus(serverId, 'disconnected');
    this.emit('server-status', { id: serverId, status: 'disconnected' });
  }

  async refreshTools(serverId: string): Promise<McpToolRecord[]> {
    const client = this.clients.get(serverId);
    if (!client || client.status !== 'connected') throw new Error('Server not connected');

    const result = await client.listTools();
    const db = getDatabase();

    db.prepare('DELETE FROM mcp_tools WHERE server_id = ?').run(serverId);

    const insert = db.prepare(`
      INSERT INTO mcp_tools (id, server_id, name, description, input_schema)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tools: McpToolRecord[] = [];
    for (const tool of result.tools) {
      const id = `mcp-tool-${randomUUID().slice(0, 8)}`;
      insert.run(id, serverId, tool.name, tool.description || null, JSON.stringify(tool.inputSchema || {}));
      tools.push({ id, server_id: serverId, name: tool.name, description: tool.description || null, input_schema: JSON.stringify(tool.inputSchema || {}) });
    }

    this.emit('server-tools', { id: serverId, tools });
    return tools;
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client || client.status !== 'connected') throw new Error('Server not connected');
    return client.callTool(toolName, args);
  }

  listTools(serverId: string): McpToolRecord[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM mcp_tools WHERE server_id = ?').all(serverId) as McpToolRecord[];
  }

  getProtocolLogs(serverId?: string, limit = 500): McpProtocolLogEntry[] {
    const db = getDatabase();
    if (serverId) {
      return db.prepare('SELECT * FROM mcp_protocol_log WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?').all(serverId, limit) as McpProtocolLogEntry[];
    }
    return db.prepare('SELECT * FROM mcp_protocol_log ORDER BY timestamp DESC LIMIT ?').all(limit) as McpProtocolLogEntry[];
  }

  clearProtocolLogs(serverId?: string): void {
    const db = getDatabase();
    if (serverId) {
      db.prepare('DELETE FROM mcp_protocol_log WHERE server_id = ?').run(serverId);
    } else {
      db.prepare('DELETE FROM mcp_protocol_log').run();
    }
  }

  private updateStatus(serverId: string, status: string, errorMessage?: string): void {
    const db = getDatabase();
    db.prepare('UPDATE mcp_servers SET status = ?, error_message = ? WHERE id = ?').run(status, errorMessage || null, serverId);
  }

  private async autoConnect(server: McpServerRecord): Promise<void> {
    try {
      await this.connectServer(server.id);
    } catch {
      // Auto-connect failures are logged via status update, not fatal
    }
  }

  async shutdown(): Promise<void> {
    for (const [id] of this.clients) {
      await this.disconnectServer(id);
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/main/mcp/MCPManager.ts
git commit -m "feat(mcp): add MCPManager service with CRUD, connect, and protocol logging"
```

---

### Task 7: Wire MCPManager into Main Process

**Files:**
- Modify: `src/main/main.ts`

**Step 1: Import MCPManager**

Add at the top of main.ts (after line 30):

```typescript
import { MCPManager } from './mcp/MCPManager';
```

**Step 2: Declare mcpManager variable**

Add after `const debugLogService = new DebugLogService();` (line 44):

```typescript
let mcpManager: MCPManager;
```

**Step 3: Initialize MCPManager in initializeServices()**

Add after `chatService = new ChatService(...)` (line 189), before the Logger.info line:

```typescript
  // 初始化 MCP 管理器
  mcpManager = new MCPManager();
  await mcpManager.initialize();
```

**Step 4: Add MCP IPC handlers in setupIPCHandlers()**

Add before the `Logger.info('IPC handlers registered');` line (around line 793):

```typescript
  // MCP Server 相关
  ipcMain.handle(IPCChannels.MCP_SERVER_LIST, async () => {
    return mcpManager.listServers();
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_GET, async (_, serverId: string) => {
    return mcpManager.getServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_CREATE, async (_, config: any) => {
    return mcpManager.createServer(config);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_UPDATE, async (_, serverId: string, updates: any) => {
    return mcpManager.updateServer(serverId, updates);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_DELETE, async (_, serverId: string) => {
    return mcpManager.deleteServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_CONNECT, async (_, serverId: string) => {
    return mcpManager.connectServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_DISCONNECT, async (_, serverId: string) => {
    return mcpManager.disconnectServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_REFRESH_TOOLS, async (_, serverId: string) => {
    return mcpManager.refreshTools(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_CALL_TOOL, async (_, serverId: string, toolName: string, args: any) => {
    return mcpManager.callTool(serverId, toolName, args);
  });

  // MCP server status events (broadcast to all windows)
  mcpManager.on('server-status', (data) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.MCP_SERVER_STATUS_EVENT, data);
      }
    }
  });

  mcpManager.on('server-tools', (data) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.MCP_SERVER_TOOLS_EVENT, data);
      }
    }
  });

  // MCP Debug 相关
  ipcMain.handle(IPCChannels.MCP_DEBUG_LOGS, async (_, serverId?: string) => {
    return mcpManager.getProtocolLogs(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_DEBUG_CLEAR, async (_, serverId?: string) => {
    return mcpManager.clearProtocolLogs(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_DEBUG_EXPORT, async (_, serverId?: string) => {
    const logs = mcpManager.getProtocolLogs(serverId, 10000);
    return JSON.stringify(logs, null, 2);
  });

  // MCP protocol log events (broadcast to all windows)
  mcpManager.on('protocol-log', (entry) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.MCP_DEBUG_LOG_EVENT, entry);
      }
    }
  });
```

**Step 5: Add shutdown hook**

In the `window-all-closed` handler (line 1334), add before `closeDatabase()`:

```typescript
  await mcpManager.shutdown();
```

Note: This needs to be async. Change the handler to:
```typescript
app.on('window-all-closed', async () => {
  await mcpManager.shutdown();
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

**Step 6: Verify the app starts**

Run: `npm run dev`
Expected: App launches without errors, no migration failures

**Step 7: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(mcp): wire MCPManager into main process with IPC handlers"
```

---

### Task 8: Expose MCP API in Preload

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: Add MCP API methods**

Add inside the `contextBridge.exposeInMainWorld('electronAPI', {` object, before the closing `})` (line 178):

```typescript
  // MCP Server API
  mcpServers: {
    list: () => ipcRenderer.invoke(IPCChannels.MCP_SERVER_LIST),
    get: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_GET, serverId),
    create: (config: any) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_CREATE, config),
    update: (serverId: string, updates: any) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_UPDATE, serverId, updates),
    delete: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_DELETE, serverId),
    connect: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_CONNECT, serverId),
    disconnect: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_DISCONNECT, serverId),
    refreshTools: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_REFRESH_TOOLS, serverId),
    callTool: (serverId: string, toolName: string, args: any) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_CALL_TOOL, serverId, toolName, args),
    onStatusChange: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.MCP_SERVER_STATUS_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.MCP_SERVER_STATUS_EVENT, listener);
    },
    onToolsChange: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.MCP_SERVER_TOOLS_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.MCP_SERVER_TOOLS_EVENT, listener);
    },
  },

  // MCP Debug API
  mcpDebug: {
    getLogs: (serverId?: string) => ipcRenderer.invoke(IPCChannels.MCP_DEBUG_LOGS, serverId),
    clearLogs: (serverId?: string) => ipcRenderer.invoke(IPCChannels.MCP_DEBUG_CLEAR, serverId),
    exportLogs: (serverId?: string) => ipcRenderer.invoke(IPCChannels.MCP_DEBUG_EXPORT, serverId),
    onLogEvent: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.MCP_DEBUG_LOG_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.MCP_DEBUG_LOG_EVENT, listener);
    },
  },
```

**Step 2: Add type definitions to ElectronAPI interface**

Add to the `ElectronAPI` interface (before the closing `}`, line 280):

```typescript
  mcpServers: {
    list: () => Promise<any[]>;
    get: (serverId: string) => Promise<any>;
    create: (config: any) => Promise<string>;
    update: (serverId: string, updates: any) => Promise<void>;
    delete: (serverId: string) => Promise<void>;
    connect: (serverId: string) => Promise<void>;
    disconnect: (serverId: string) => Promise<void>;
    refreshTools: (serverId: string) => Promise<any[]>;
    callTool: (serverId: string, toolName: string, args: any) => Promise<any>;
    onStatusChange: (callback: (data: any) => void) => () => void;
    onToolsChange: (callback: (data: any) => void) => () => void;
  };
  mcpDebug: {
    getLogs: (serverId?: string) => Promise<any[]>;
    clearLogs: (serverId?: string) => Promise<void>;
    exportLogs: (serverId?: string) => Promise<string>;
    onLogEvent: (callback: (data: any) => void) => () => void;
  };
```

**Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(mcp): expose MCP API in preload script"
```

---

### Task 9: Add Nav Tabs and Routing

**Files:**
- Modify: `src/renderer/components/NavRail.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Add MCP nav items to NavRail**

In `src/renderer/components/NavRail.tsx`, update the import on line 2 to add the `Cable` icon (or `Plug`/`Server` icon — pick one that fits):

```typescript
import { Home, LayoutDashboard, MessageSquare, Zap, Wrench, FileText, Search, Settings, Sun, Moon, Monitor, PanelLeftClose, PanelLeft, Bug, Cable, Activity } from 'lucide-react';
```

Add to `navItems` array (line 13-21), after the `tools` entry and before `prompts`:

```typescript
  { id: 'mcp-servers', icon: Cable, label: 'MCP' },
  { id: 'mcp-debug', icon: Activity, label: 'MCP Debug' },
```

**Step 2: Add page routing in App.tsx**

In `src/renderer/App.tsx`, add imports (after line 11):

```typescript
import McpServersPage from './pages/McpServersPage';
import McpDebugPage from './pages/McpDebugPage';
```

Add route rendering (after the `tools` route, line 114):

```typescript
              {activeTab === 'mcp-servers' && <McpServersPage />}
              {activeTab === 'mcp-debug' && <McpDebugPage />}
```

**Step 3: Commit**

```bash
git add src/renderer/components/NavRail.tsx src/renderer/App.tsx
git commit -m "feat(mcp): add MCP nav tabs and page routing"
```

---

### Task 10: Create MCP Zustand Store

**Files:**
- Create: `src/renderer/stores/mcp-store.ts`

**Step 1: Create the Zustand store**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/renderer/stores/mcp-store.ts
git commit -m "feat(mcp): add MCP Zustand store"
```

---

### Task 11: Create MCP Servers Page

**Files:**
- Create: `src/renderer/pages/McpServersPage.tsx`
- Create: `src/renderer/components/mcp/ServerList.tsx`
- Create: `src/renderer/components/mcp/ServerConfigForm.tsx`
- Create: `src/renderer/components/mcp/ServerTools.tsx`
- Create: `src/renderer/components/mcp/ServerToolTest.tsx`

**Step 1: Create the directory**

Run: `mkdir -p src/renderer/components/mcp`

**Step 2: Create ServerList.tsx**

Left panel component listing all MCP servers with search, status indicators, and add/delete actions.

```typescript
import { useState } from 'react';
import { Plus, Trash2, Search, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '@/lib/utils';

interface McpServer {
  id: string;
  name: string;
  transport_type: 'stdio' | 'sse';
  status: string;
  error_message: string | null;
  enabled: number;
}

interface ServerListProps {
  servers: McpServer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export function ServerList({ servers, selectedId, onSelect, onAdd, onDelete }: ServerListProps) {
  const [search, setSearch] = useState('');

  const filtered = servers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search servers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Button size="sm" className="h-8" onClick={onAdd}>
            <Plus size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-1">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            {search ? 'No servers found' : 'No MCP servers added'}
          </div>
        ) : (
          filtered.map((server) => (
            <button
              key={server.id}
              onClick={() => onSelect(server.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                selectedId === server.id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-[var(--surface-hover)] text-foreground'
              )}
            >
              <StatusIcon status={server.status} error={server.error_message} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{server.name}</div>
                <div className="text-xs text-muted-foreground">
                  {server.transport_type.toUpperCase()}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onDelete(server.id); }}
              >
                <Trash2 size={12} />
              </Button>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status, error }: { status: string; error: string | null }) {
  if (status === 'connected') return <Wifi size={14} className="text-green-500 shrink-0" />;
  if (status === 'error') return <AlertCircle size={14} className="text-red-500 shrink-0" title={error || ''} />;
  if (status === 'connecting') return <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-pulse shrink-0" />;
  return <WifiOff size={14} className="text-muted-foreground shrink-0" />;
}
```

**Step 3: Create ServerConfigForm.tsx**

Form for configuring an MCP server (name, transport type, command/args for stdio, URL for SSE, enable/disable).

```typescript
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

interface ServerConfig {
  name: string;
  transportType: 'stdio' | 'sse';
  command: string;
  args: string;
  env: string;
  url: string;
  enabled: boolean;
}

const defaultConfig: ServerConfig = {
  name: '',
  transportType: 'stdio',
  command: 'npx',
  args: '',
  env: '',
  url: '',
  enabled: true,
};

interface ServerConfigFormProps {
  initialData?: Partial<ServerConfig & { id: string }>;
  onSave: (config: ServerConfig) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  status: string;
  loading?: boolean;
}

export function ServerConfigForm({ initialData, onSave, onConnect, onDisconnect, status, loading }: ServerConfigFormProps) {
  const [config, setConfig] = useState<ServerConfig>({
    ...defaultConfig,
    name: initialData?.name || '',
    transportType: initialData?.transportType || 'stdio',
    command: initialData?.command || 'npx',
    args: initialData?.args || '',
    env: initialData?.env || '',
    url: initialData?.url || '',
    enabled: initialData?.enabled !== false,
  });

  useEffect(() => {
    if (initialData) {
      setConfig({
        name: initialData.name || '',
        transportType: initialData.transportType || 'stdio',
        command: initialData.command || 'npx',
        args: initialData.args || '',
        env: initialData.env || '',
        url: initialData.url || '',
        enabled: initialData.enabled !== false,
      });
    }
  }, [initialData]);

  const handleSave = () => {
    onSave(config);
  };

  const update = (field: keyof ServerConfig, value: unknown) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Configuration</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor="enabled" className="text-xs text-muted-foreground">Enabled</Label>
          <Switch
            id="enabled"
            checked={config.enabled}
            onCheckedChange={(v) => update('enabled', v)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={config.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="My MCP Server"
            className="h-8 text-sm mt-1"
          />
        </div>

        <div>
          <Label className="text-xs">Transport</Label>
          <div className="flex gap-2 mt-1">
            <Button
              size="sm"
              variant={config.transportType === 'stdio' ? 'default' : 'outline'}
              onClick={() => update('transportType', 'stdio')}
              className="text-xs h-7"
            >
              Stdio
            </Button>
            <Button
              size="sm"
              variant={config.transportType === 'sse' ? 'default' : 'outline'}
              onClick={() => update('transportType', 'sse')}
              className="text-xs h-7"
            >
              SSE
            </Button>
          </div>
        </div>

        {config.transportType === 'stdio' ? (
          <>
            <div>
              <Label className="text-xs">Command</Label>
              <Input
                value={config.command}
                onChange={(e) => update('command', e.target.value)}
                placeholder="npx"
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Args (one per line)</Label>
              <textarea
                value={config.args}
                onChange={(e) => update('args', e.target.value)}
                placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/tmp"}
                className="w-full min-h-[60px] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm mt-1 resize-y"
              />
            </div>
            <div>
              <Label className="text-xs">Env vars (KEY=VALUE, one per line)</Label>
              <textarea
                value={config.env}
                onChange={(e) => update('env', e.target.value)}
                placeholder={"API_KEY=xxx\nDEBUG=true"}
                className="w-full min-h-[40px] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm mt-1 resize-y"
              />
            </div>
          </>
        ) : (
          <div>
            <Label className="text-xs">Server URL</Label>
            <Input
              value={config.url}
              onChange={(e) => update('url', e.target.value)}
              placeholder="http://localhost:3000/sse"
              className="h-8 text-sm mt-1"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={handleSave} disabled={!config.name || loading}>
          Save
        </Button>
        {status === 'connected' ? (
          <Button size="sm" variant="outline" onClick={onDisconnect} disabled={loading}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onConnect} disabled={!config.name || loading}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Create ServerTools.tsx**

Displays discovered tools for a connected server.

```typescript
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface McpTool {
  id: string;
  name: string;
  description: string | null;
  input_schema: string | null;
}

interface ServerToolsProps {
  tools: McpTool[];
  onRefresh: () => void;
  loading?: boolean;
}

export function ServerTools({ tools, onRefresh, loading }: ServerToolsProps) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Discovered Tools ({tools.length})</h3>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} className="h-7 text-xs">
          <RefreshCw size={12} className="mr-1" />
          Refresh
        </Button>
      </div>

      {tools.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          No tools discovered. Connect to the server first.
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <div key={tool.id} className="border border-[hsl(var(--border))] rounded-lg p-3">
              <div className="font-mono text-sm font-medium text-primary">{tool.name}</div>
              {tool.description && (
                <div className="text-xs text-muted-foreground mt-1">{tool.description}</div>
              )}
              {tool.input_schema && tool.input_schema !== '{}' && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Input Schema</summary>
                  <pre className="text-xs mt-1 p-2 rounded bg-[var(--surface)] overflow-auto max-h-40">
                    {JSON.stringify(JSON.parse(tool.input_schema), null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 5: Create ServerToolTest.tsx**

Interactive tool tester with auto-generated form from JSON schema.

```typescript
import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface McpTool {
  name: string;
  description: string | null;
  input_schema: string | null;
}

interface ServerToolTestProps {
  tools: McpTool[];
  onCallTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export function ServerToolTest({ tools, onCallTool }: ServerToolTestProps) {
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const schema = selectedTool?.input_schema ? JSON.parse(selectedTool.input_schema) : null;
  const properties = schema?.properties || {};
  const required = schema?.required || [];

  const handleToolSelect = (tool: McpTool) => {
    setSelectedTool(tool);
    setResult(null);
    setParams({});
  };

  const handleCall = async () => {
    if (!selectedTool) return;
    setLoading(true);
    setResult(null);
    try {
      const typedParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value === '') continue;
        const propSchema = properties[key];
        if (propSchema?.type === 'number') {
          typedParams[key] = Number(value);
        } else if (propSchema?.type === 'boolean') {
          typedParams[key] = value === 'true';
        } else if (propSchema?.type === 'array' || propSchema?.type === 'object') {
          try { typedParams[key] = JSON.parse(value); } catch { typedParams[key] = value; }
        } else {
          typedParams[key] = value;
        }
      }
      const res = await onCallTool(selectedTool.name, typedParams);
      setResult(JSON.stringify(res, null, 2));
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-medium">Test Tool</h3>

      {tools.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-6">
          No tools available. Connect to the server first.
        </div>
      ) : (
        <>
          <div>
            <Label className="text-xs">Select Tool</Label>
            <select
              value={selectedTool?.name || ''}
              onChange={(e) => {
                const tool = tools.find(t => t.name === e.target.value);
                if (tool) handleToolSelect(tool);
              }}
              className="w-full h-8 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm mt-1"
            >
              <option value="">Choose a tool...</option>
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>{tool.name}</option>
              ))}
            </select>
          </div>

          {selectedTool && Object.keys(properties).length > 0 && (
            <div className="space-y-2">
              {Object.entries(properties).map(([key, schema]: [string, any]) => (
                <div key={key}>
                  <Label className="text-xs">
                    {key}
                    {required.includes(key) && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    value={params[key] || ''}
                    onChange={(e) => setParams(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={schema.description || schema.type || ''}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              ))}
            </div>
          )}

          <Button size="sm" onClick={handleCall} disabled={!selectedTool || loading}>
            <Play size={12} className="mr-1" />
            Run
          </Button>

          {result !== null && (
            <pre className="text-xs p-3 rounded-lg bg-[var(--surface)] border border-[hsl(var(--border))] overflow-auto max-h-60 whitespace-pre-wrap">
              {result}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 6: Create McpServersPage.tsx**

Main page combining all the sub-components.

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useMcpStore } from '../stores/mcp-store';
import { ServerList } from '../components/mcp/ServerList';
import { ServerConfigForm } from '../components/mcp/ServerConfigForm';
import { ServerTools } from '../components/mcp/ServerTools';
import { ServerToolTest } from '../components/mcp/ServerToolTest';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';

export default function McpServersPage() {
  const {
    servers, selectedServerId, serverTools, loading,
    setServers, setSelectedServerId, setServerTools, setLoading, updateServerStatus,
  } = useMcpStore();

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [detailTab, setDetailTab] = useState('config');
  const [showAddForm, setShowAddForm] = useState(false);

  const selectedServer = servers.find(s => s.id === selectedServerId);
  const api = window.electronAPI?.mcpServers;

  const loadServers = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const list = await api.list();
      setServers(list);
    } finally {
      setLoading(false);
    }
  }, [api, setServers, setLoading]);

  const loadTools = useCallback(async (serverId: string) => {
    if (!api) return;
    try {
      const tools = await api.refreshTools(serverId);
      setServerTools(tools);
    } catch {
      setServerTools([]);
    }
  }, [api, setServerTools]);

  useEffect(() => { loadServers(); }, [loadServers]);

  useEffect(() => {
    if (selectedServerId && selectedServer?.status === 'connected') {
      loadTools(selectedServerId);
    } else {
      setServerTools([]);
    }
  }, [selectedServerId, selectedServer?.status]);

  useEffect(() => {
    if (!api) return;
    const unsub = api.onStatusChange((data: any) => {
      updateServerStatus(data.id, data.status, data.error);
    });
    return unsub;
  }, [api, updateServerStatus]);

  const handleAdd = () => {
    setSelectedServerId(null);
    setShowAddForm(true);
  };

  const handleSaveNew = async (config: any) => {
    if (!api) return;
    const argsArray = config.args ? config.args.split('\n').filter((l: string) => l.trim()) : [];
    const envObj: Record<string, string> = {};
    if (config.env) {
      config.env.split('\n').filter((l: string) => l.trim()).forEach((line: string) => {
        const eq = line.indexOf('=');
        if (eq > 0) envObj[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      });
    }
    const id = await api.create({
      name: config.name,
      transportType: config.transportType,
      command: config.transportType === 'stdio' ? config.command : undefined,
      args: config.transportType === 'stdio' ? argsArray : undefined,
      env: config.transportType === 'stdio' ? envObj : undefined,
      url: config.transportType === 'sse' ? config.url : undefined,
      enabled: config.enabled,
    });
    setShowAddForm(false);
    await loadServers();
    setSelectedServerId(id);
  };

  const handleSaveExisting = async (config: any) => {
    if (!api || !selectedServerId) return;
    const argsArray = config.args ? config.args.split('\n').filter((l: string) => l.trim()) : [];
    const envObj: Record<string, string> = {};
    if (config.env) {
      config.env.split('\n').filter((l: string) => l.trim()).forEach((line: string) => {
        const eq = line.indexOf('=');
        if (eq > 0) envObj[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      });
    }
    await api.update(selectedServerId, {
      name: config.name,
      transportType: config.transportType,
      command: config.transportType === 'stdio' ? config.command : undefined,
      args: config.transportType === 'stdio' ? argsArray : undefined,
      env: config.transportType === 'stdio' ? envObj : undefined,
      url: config.transportType === 'sse' ? config.url : undefined,
      enabled: config.enabled,
    });
    await loadServers();
  };

  const handleConnect = async () => {
    if (!api || !selectedServerId) return;
    try { await api.connect(selectedServerId); } catch {}
    await loadServers();
  };

  const handleDisconnect = async () => {
    if (!api || !selectedServerId) return;
    try { await api.disconnect(selectedServerId); } catch {}
    await loadServers();
  };

  const handleDelete = async (serverId: string) => {
    if (!api) return;
    if (!confirm('Delete this MCP server?')) return;
    await api.delete(serverId);
    if (selectedServerId === serverId) setSelectedServerId(null);
    await loadServers();
  };

  const handleCallTool = async (toolName: string, args: Record<string, unknown>) => {
    if (!api || !selectedServerId) throw new Error('No server selected');
    return api.callTool(selectedServerId, toolName, args);
  };

  return (
    <div className="h-full w-full flex">
      <div style={{ width: sidebarWidth }} className="h-full border-r border-[hsl(var(--border))] shrink-0">
        <ServerList
          servers={servers}
          selectedId={selectedServerId}
          onSelect={(id) => { setSelectedServerId(id); setShowAddForm(false); }}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />
      </div>

      <div className="flex-1 h-full min-w-0 overflow-auto">
        {showAddForm ? (
          <ServerConfigForm
            onSave={handleSaveNew}
            onConnect={() => {}}
            onDisconnect={() => {}}
            status="disconnected"
            loading={loading}
          />
        ) : selectedServer ? (
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <div className="border-b border-[hsl(var(--border))] px-4">
              <TabsList className="h-9">
                <TabsTrigger value="config" className="text-xs">Config</TabsTrigger>
                <TabsTrigger value="tools" className="text-xs">Tools</TabsTrigger>
                <TabsTrigger value="test" className="text-xs">Test</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="config">
              <ServerConfigForm
                initialData={{
                  id: selectedServer.id,
                  name: selectedServer.name,
                  transportType: selectedServer.transport_type,
                  command: selectedServer.command || '',
                  args: selectedServer.args ? JSON.parse(selectedServer.args).join('\n') : '',
                  env: selectedServer.env ? Object.entries(JSON.parse(selectedServer.env)).map(([k, v]) => `${k}=${v}`).join('\n') : '',
                  url: selectedServer.url || '',
                  enabled: !!selectedServer.enabled,
                }}
                onSave={handleSaveExisting}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                status={selectedServer.status}
                loading={loading}
              />
            </TabsContent>
            <TabsContent value="tools">
              <ServerTools
                tools={serverTools}
                onRefresh={() => selectedServerId && loadTools(selectedServerId)}
                loading={loading}
              />
            </TabsContent>
            <TabsContent value="test">
              <ServerToolTest tools={serverTools} onCallTool={handleCallTool} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a server to view details
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add src/renderer/pages/McpServersPage.tsx src/renderer/components/mcp/
git commit -m "feat(mcp): add MCP Servers page with config, tools, and test views"
```

---

### Task 12: Create MCP Debug Page

**Files:**
- Create: `src/renderer/pages/McpDebugPage.tsx`

**Step 1: Create the MCP Debug page**

Full protocol trace inspector with filtering and JSON detail view.

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMcpStore } from '../stores/mcp-store';
import { Search, Trash2, Download, ArrowDown, ArrowUp, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  server_id: string;
  direction: 'sent' | 'received';
  message_type: string;
  method: string | null;
  payload_json: string;
  timestamp: string;
}

const MESSAGE_TYPES = ['all', 'initialize', 'initialized', 'tools/list', 'tools/call', 'notification'];

export default function McpDebugPage() {
  const { servers, protocolLogs, setProtocolLogs, addProtocolLog } = useMcpStore();
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const api = window.electronAPI?.mcpDebug;

  const loadLogs = useCallback(async () => {
    if (!api) return;
    const serverId = serverFilter === 'all' ? undefined : serverFilter;
    const logs = await api.getLogs(serverId);
    setProtocolLogs(logs);
  }, [api, serverFilter, setProtocolLogs]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (!api) return;
    const unsub = api.onLogEvent((entry: LogEntry) => {
      addProtocolLog(entry);
    });
    return unsub;
  }, [api, addProtocolLog]);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [protocolLogs, autoScroll]);

  const filteredLogs = protocolLogs.filter((log) => {
    if (serverFilter !== 'all' && log.server_id !== serverFilter) return false;
    if (typeFilter !== 'all' && !log.message_type.includes(typeFilter) && !log.method?.includes(typeFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.message_type.toLowerCase().includes(q) ||
        (log.method || '').toLowerCase().includes(q) ||
        log.payload_json.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedLog = protocolLogs.find(l => l.id === selectedLogId);

  const handleClear = async () => {
    if (!api) return;
    await api.clearLogs(serverFilter === 'all' ? undefined : serverFilter);
    setProtocolLogs([]);
    setSelectedLogId(null);
  };

  const handleExport = async () => {
    if (!api) return;
    const json = await api.exportLogs(serverFilter === 'all' ? undefined : serverFilter);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getServerName = (serverId: string) => {
    return servers.find(s => s.id === serverId)?.name || serverId.slice(0, 12);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[hsl(var(--border))] shrink-0">
        <select
          value={serverFilter}
          onChange={(e) => setServerFilter(e.target.value)}
          className="h-7 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
        >
          <option value="all">All Servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-7 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
        >
          {MESSAGE_TYPES.map((t) => (
            <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="h-7 pl-7 text-xs"
          />
        </div>

        <Button size="sm" variant="ghost" onClick={() => setAutoScroll(!autoScroll)} className={cn('h-7 text-xs', autoScroll && 'text-primary')}>
          Auto-scroll
        </Button>
        <Button size="sm" variant="ghost" onClick={handleExport} className="h-7 text-xs">
          <Download size={12} className="mr-1" /> Export
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear} className="h-7 text-xs">
          <Trash2 size={12} className="mr-1" /> Clear
        </Button>
      </div>

      {/* Log list */}
      <div ref={listRef} className="flex-1 overflow-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No protocol messages
          </div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {filteredLogs.map((log) => (
              <button
                key={log.id}
                onClick={() => setSelectedLogId(log.id === selectedLogId ? null : log.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-left text-xs hover:bg-[var(--surface-hover)] transition-colors',
                  selectedLogId === log.id && 'bg-primary/5'
                )}
              >
                <span className="text-muted-foreground w-16 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>

                <span className="w-20 truncate text-muted-foreground">{getServerName(log.server_id)}</span>

                <span className={cn(
                  'shrink-0',
                  log.direction === 'sent' ? 'text-blue-500' : 'text-green-500'
                )}>
                  {log.direction === 'sent' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                </span>

                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] shrink-0">
                  {log.message_type}
                </span>

                <span className="truncate text-muted-foreground">{log.method || ''}</span>

                <span className="text-muted-foreground ml-auto shrink-0">
                  {log.payload_json.length > 100 ? `${(log.payload_json.length / 1024).toFixed(1)}KB` : `${log.payload_json.length}B`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedLog && (
        <div className="border-t border-[hsl(var(--border))] max-h-[40%] overflow-auto">
          <div className="flex items-center justify-between px-4 py-1 border-b border-[hsl(var(--border))]">
            <span className="text-xs font-medium">
              {selectedLog.direction === 'sent' ? 'Sent' : 'Received'} — {selectedLog.message_type}
              {selectedLog.method ? ` — ${selectedLog.method}` : ''}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => navigator.clipboard.writeText(selectedLog.payload_json)}
            >
              Copy
            </Button>
          </div>
          <pre className="p-4 text-xs overflow-auto whitespace-pre-wrap">
            {(() => {
              try { return JSON.stringify(JSON.parse(selectedLog.payload_json), null, 2); }
              catch { return selectedLog.payload_json; }
            })()}
          </pre>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/pages/McpDebugPage.tsx
git commit -m "feat(mcp): add MCP Debug page with protocol trace inspector"
```

---

### Task 13: Verify and Fix UI Components

**Files:**
- May need to generate shadcn components: `Tabs`, `Switch`, `Label`

**Step 1: Check which UI components already exist**

Run: `ls src/renderer/components/ui/`

Check if `tabs.tsx`, `switch.tsx`, `label.tsx` exist. If any are missing, generate them:

```bash
npx shadcn@latest add tabs
npx shadcn@latest add switch
npx shadcn@latest add label
```

**Step 2: Verify the app builds**

Run: `npm run dev`
Expected: App launches, MCP and MCP Debug tabs visible in nav rail

**Step 3: Commit any generated components**

```bash
git add src/renderer/components/ui/
git commit -m "chore: add shadcn UI components for MCP pages"
```

---

### Task 14: End-to-End Smoke Test

**Step 1: Start the app**

Run: `npm run dev`

**Step 2: Test MCP Servers page**

1. Click "MCP" nav tab — page loads with empty server list
2. Click "+" to add a new server
3. Fill in name "Test FS", transport "Stdio", command "npx", args "-y\n@modelcontextprotocol/server-filesystem\n/tmp"
4. Click "Save" — server appears in list
5. Click "Connect" — status changes to connected (green icon)
6. Switch to "Tools" tab — should show `read_file`, `write_file`, etc.
7. Switch to "Test" tab — select a tool, fill params, click "Run"
8. Click "Disconnect" — status changes to disconnected

**Step 3: Test MCP Debug page**

1. Click "MCP Debug" nav tab — page loads
2. Should see protocol messages from the connect/test operations
3. Click a log entry — detail panel shows full JSON payload
4. Test filters — server dropdown, type dropdown, search
5. Click "Export" — downloads JSON file
6. Click "Clear" — logs cleared

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat(mcp): complete MCP management with server config and protocol debug"
```
