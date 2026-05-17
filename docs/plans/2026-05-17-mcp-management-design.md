# MCP Management Design

## Overview

Add Model Context Protocol (MCP) support to the app with two new nav tabs: **MCP Servers** for configuring and managing MCP server connections, and **MCP Debug** for full protocol trace inspection.

## Transport Support

- **Stdio**: Local MCP servers spawned as child processes, communicating via stdin/stdout JSON-RPC
- **SSE**: Remote MCP servers accessed via HTTP Server-Sent Events

## Architecture

### MCPManager Service (Main Process)

New service at `src/main/mcp/MCPManager.ts` following the existing manager pattern (EventEmitter, SQLite, IPC handlers).

**Responsibilities:**
- CRUD for MCP server configs in SQLite
- Spawn stdio MCP servers as child processes
- Connect to SSE MCP servers via HTTP
- Handle MCP protocol lifecycle: initialize → capability negotiation → tool listing → tool calls
- Emit events for state changes (connected, disconnected, error)
- Log all protocol messages for the debug trace

**IPC Channels** (following existing `domain:action` pattern):
- `mcp-server:list`, `mcp-server:get`, `mcp-server:create`, `mcp-server:update`, `mcp-server:delete`
- `mcp-server:connect`, `mcp-server:disconnect`, `mcp-server:refresh-tools`
- `mcp-server:call-tool`
- `mcp-debug:logs`, `mcp-debug:clear`, `mcp-debug:export`

### Database Tables

```sql
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'sse')),
  command TEXT,          -- for stdio
  args TEXT,             -- JSON array, for stdio
  env TEXT,              -- JSON object, for stdio
  url TEXT,              -- for sse
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'disconnected',  -- connected, disconnected, error
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE mcp_tools (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id),
  name TEXT NOT NULL,
  description TEXT,
  input_schema TEXT,     -- JSON Schema
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE TABLE mcp_protocol_log (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id),
  direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
  message_type TEXT NOT NULL,  -- initialize, initialized, tools/list, tools/call, notification, etc.
  method TEXT,
  payload_json TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);
```

### MCP Servers Page (Renderer)

New nav tab with list/detail layout similar to ToolsPage.

**Layout:**
- Left panel: Server list with search/filter, each entry shows name, transport badge (stdio/SSE), status indicator
- Right panel: Selected server detail with tabs:
  - Config: form fields for name, transport type, command/args/env (stdio) or URL (SSE), enable/disable
  - Tools: list of discovered tools with name, description, input schema
  - Test: interactive tool caller with auto-generated form from JSON schema

**Status indicators:** Green = connected, gray = disconnected, red = error

### MCP Debug Page (Renderer)

New nav tab — full protocol trace inspector.

**Layout:**
- Top bar: server filter, message type filter, search, clear log, auto-scroll toggle
- Main area: chronological log entries with timestamp, server name, direction arrow, message type badge, summary
- Bottom panel (expandable): full JSON payload with syntax highlighting

**Features:**
- Real-time streaming via IPC events
- Color coding: sent = blue, received = green, errors = red
- Collapsible JSON tree
- Export log as JSON file

## Dependencies

- `@modelcontextprotocol/sdk` — official MCP SDK for TypeScript

## File Structure

```
src/main/mcp/
  MCPManager.ts          -- Main service, protocol handling
  McpClient.ts           -- MCP client wrapper (stdio + SSE transport)
  types.ts               -- MCP-specific types

src/renderer/pages/
  McpServersPage.tsx      -- Servers management page
  McpDebugPage.tsx        -- Protocol trace inspector

src/renderer/components/mcp/
  ServerList.tsx          -- Left panel server list
  ServerConfigForm.tsx    -- Server configuration form
  ServerTools.tsx         -- Discovered tools list
  ServerToolTest.tsx      -- Interactive tool tester
  ProtocolLogList.tsx     -- Protocol message log
  ProtocolLogDetail.tsx   -- Message payload detail view

src/renderer/stores/
  mcp-store.ts            -- Zustand store for MCP state

src/shared/
  ipc-channels.ts         -- Add MCP IPC channel definitions
```
