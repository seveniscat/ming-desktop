import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { McpClient } from './McpClient';
import {
  McpServerConfig,
  McpServerRecord,
  McpToolRecord,
  McpProtocolLogEntry,
} from './types';
import { getDatabase } from '../database/connection';
import { Logger } from '../utils/Logger';

export class MCPManager extends EventEmitter {
  clients: Map<string, McpClient> = new Map();

  async initialize(): Promise<void> {
    Logger.info('Initializing MCP Manager...');

    const db = getDatabase();
    const servers = db.prepare(
      "SELECT * FROM mcp_servers WHERE enabled = 1"
    ).all() as McpServerRecord[];

    for (const server of servers) {
      try {
        await this.connectServer(server.id);
      } catch (error) {
        Logger.error(`Failed to auto-connect MCP server ${server.name}:`, error);
      }
    }

    Logger.info(`MCP Manager initialized, ${servers.length} enabled servers`);
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
    const id = config.id || `mcp-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const db = getDatabase();

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
      now,
    );

    Logger.info(`MCP server created: ${config.name}`);
    this.emit('server-created', { id });

    return id;
  }

  updateServer(serverId: string, updates: Partial<McpServerConfig>): void {
    const db = getDatabase();
    const existing = this.getServer(serverId);
    if (!existing) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.transportType !== undefined) {
      fields.push('transport_type = ?');
      values.push(updates.transportType);
    }
    if (updates.command !== undefined) {
      fields.push('command = ?');
      values.push(updates.command || null);
    }
    if (updates.args !== undefined) {
      fields.push('args = ?');
      values.push(JSON.stringify(updates.args));
    }
    if (updates.env !== undefined) {
      fields.push('env = ?');
      values.push(JSON.stringify(updates.env));
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url || null);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());

      db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`).run(
        ...values,
        serverId,
      );
    }

    // Disconnect if currently connected
    if (this.clients.has(serverId)) {
      this.disconnectServer(serverId).catch((error) => {
        Logger.error(`Failed to disconnect MCP server during update: ${serverId}`, error);
      });
    }

    Logger.info(`MCP server updated: ${serverId}`);
    this.emit('server-updated', { id: serverId });
  }

  deleteServer(serverId: string): void {
    // Disconnect if connected
    if (this.clients.has(serverId)) {
      this.disconnectServer(serverId).catch((error) => {
        Logger.error(`Failed to disconnect MCP server during delete: ${serverId}`, error);
      });
    }

    const db = getDatabase();
    db.prepare('DELETE FROM mcp_tools WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM mcp_protocol_log WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(serverId);

    Logger.info(`MCP server deleted: ${serverId}`);
    this.emit('server-deleted', { id: serverId });
  }

  async connectServer(serverId: string): Promise<void> {
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    // Disconnect existing client if any
    if (this.clients.has(serverId)) {
      await this.disconnectServer(serverId);
    }

    const db = getDatabase();

    const client = new McpClient(serverId, (entry) => {
      this.emit('protocol-log', entry);
    });

    // Update status to connecting
    db.prepare("UPDATE mcp_servers SET status = 'connecting', error_message = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), serverId);
    this.emit('server-status', { id: serverId, status: 'connecting' });

    try {
      if (server.transport_type === 'stdio') {
        const args = JSON.parse(server.args || '[]') as string[];
        const env = JSON.parse(server.env || '{}') as Record<string, string>;
        await client.connectStdio(server.command!, args, Object.keys(env).length > 0 ? env : undefined);
      } else if (server.transport_type === 'sse') {
        await client.connectSSE(server.url!);
      } else {
        throw new Error(`Unknown transport type: ${server.transport_type}`);
      }

      this.clients.set(serverId, client);

      db.prepare("UPDATE mcp_servers SET status = 'connected', error_message = NULL, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), serverId);
      this.emit('server-status', { id: serverId, status: 'connected' });

      // Refresh tools after connecting
      await this.refreshTools(serverId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      db.prepare("UPDATE mcp_servers SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?")
        .run(errorMessage, new Date().toISOString(), serverId);
      this.emit('server-status', { id: serverId, status: 'error', error: errorMessage });

      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }

    const db = getDatabase();
    db.prepare("UPDATE mcp_servers SET status = 'disconnected', error_message = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), serverId);
    this.emit('server-status', { id: serverId, status: 'disconnected' });
  }

  async refreshTools(serverId: string): Promise<McpToolRecord[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`MCP client not connected: ${serverId}`);
    }

    const tools = await client.listTools();
    const db = getDatabase();

    // Replace all tools for this server
    db.prepare('DELETE FROM mcp_tools WHERE server_id = ?').run(serverId);

    const insertTool = db.prepare(`
      INSERT INTO mcp_tools (id, server_id, name, description, input_schema)
      VALUES (?, ?, ?, ?, ?)
    `);

    const toolRecords: McpToolRecord[] = [];
    for (const tool of tools) {
      const record: McpToolRecord = {
        id: randomUUID(),
        server_id: serverId,
        name: tool.name,
        description: tool.description || null,
        input_schema: JSON.stringify(tool.inputSchema || null),
      };
      insertTool.run(record.id, record.server_id, record.name, record.description, record.input_schema);
      toolRecords.push(record);
    }

    Logger.info(`MCP tools refreshed for ${serverId}: ${toolRecords.length} tools`);
    this.emit('server-tools', { id: serverId, tools: toolRecords });

    return toolRecords;
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown> = {}): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`MCP client not connected: ${serverId}`);
    }

    return client.callTool(toolName, args);
  }

  listTools(serverId: string): McpToolRecord[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM mcp_tools WHERE server_id = ?').all(serverId) as McpToolRecord[];
  }

  getProtocolLogs(serverId?: string, limit: number = 100): McpProtocolLogEntry[] {
    const db = getDatabase();

    if (serverId) {
      return db.prepare(
        'SELECT * FROM mcp_protocol_log WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?'
      ).all(serverId, limit) as McpProtocolLogEntry[];
    }

    return db.prepare(
      'SELECT * FROM mcp_protocol_log ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as McpProtocolLogEntry[];
  }

  clearProtocolLogs(serverId?: string): void {
    const db = getDatabase();

    if (serverId) {
      db.prepare('DELETE FROM mcp_protocol_log WHERE server_id = ?').run(serverId);
    } else {
      db.prepare('DELETE FROM mcp_protocol_log').run();
    }
  }

  async shutdown(): Promise<void> {
    Logger.info('MCP Manager shutting down...');

    const disconnectPromises: Promise<void>[] = [];
    for (const [serverId] of this.clients) {
      disconnectPromises.push(
        this.disconnectServer(serverId).catch((error) => {
          Logger.error(`Failed to disconnect MCP server during shutdown: ${serverId}`, error);
        })
      );
    }

    await Promise.all(disconnectPromises);
    this.clients.clear();
    this.removeAllListeners();

    Logger.info('MCP Manager shut down');
  }
}
