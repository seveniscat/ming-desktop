import { randomUUID } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpProtocolLogEntry } from './types';
import { getDatabase } from '../database/connection';
import { Logger } from '../utils/Logger';

export type McpClientStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private _status: McpClientStatus = 'disconnected';
  private _errorMessage: string | null = null;
  private readonly serverId: string;
  private readonly onLog: (entry: McpProtocolLogEntry) => void;

  constructor(serverId: string, onLog: (entry: McpProtocolLogEntry) => void) {
    this.serverId = serverId;
    this.onLog = onLog;
  }

  get status(): McpClientStatus {
    return this._status;
  }

  get errorMessage(): string | null {
    return this._errorMessage;
  }

  async connectStdio(command: string, args: string[] = [], env?: Record<string, string>): Promise<void> {
    this._status = 'connecting';
    this._errorMessage = null;

    try {
      this.transport = new StdioClientTransport({
        command,
        args,
        env,
        stderr: 'pipe',
      });

      this.client = new Client(
        { name: 'ming-desktop', version: '1.0.0' },
        { capabilities: {} },
      );

      await this.client.connect(this.transport);
      this._status = 'connected';
      Logger.info(`MCP client connected (stdio): ${this.serverId}`);
    } catch (error) {
      this._status = 'error';
      this._errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`MCP client connect failed (stdio): ${this.serverId}`, error);
      throw error;
    }
  }

  async connectSSE(url: string): Promise<void> {
    this._status = 'connecting';
    this._errorMessage = null;

    try {
      this.transport = new SSEClientTransport(new URL(url));

      this.client = new Client(
        { name: 'ming-desktop', version: '1.0.0' },
        { capabilities: {} },
      );

      await this.client.connect(this.transport);
      this._status = 'connected';
      Logger.info(`MCP client connected (SSE): ${this.serverId}`);
    } catch (error) {
      this._status = 'error';
      this._errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`MCP client connect failed (SSE): ${this.serverId}`, error);
      throw error;
    }
  }

  async listTools(): Promise<any[]> {
    if (!this.client || this._status !== 'connected') {
      throw new Error(`MCP client not connected: ${this.serverId}`);
    }

    this.logProtocol('sent', 'request', 'tools/list', {});
    const result = await this.client.listTools();
    this.logProtocol('received', 'response', 'tools/list', result);
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    if (!this.client || this._status !== 'connected') {
      throw new Error(`MCP client not connected: ${this.serverId}`);
    }

    this.logProtocol('sent', 'request', 'tools/call', { name, arguments: args });
    const result = await this.client.callTool({ name, arguments: args });
    this.logProtocol('received', 'response', 'tools/call', result);
    return result;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
      }
    } catch (error) {
      Logger.warn(`MCP transport close error: ${this.serverId}`, error);
    }

    this.client = null;
    this.transport = null;
    this._status = 'disconnected';
    this._errorMessage = null;
    Logger.info(`MCP client disconnected: ${this.serverId}`);
  }

  private logProtocol(
    direction: 'sent' | 'received',
    messageType: string,
    method: string | null,
    payload: unknown,
  ): void {
    const entry: McpProtocolLogEntry = {
      id: randomUUID(),
      server_id: this.serverId,
      direction,
      message_type: messageType,
      method,
      payload_json: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
    };

    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO mcp_protocol_log (id, server_id, direction, message_type, method, payload_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id,
        entry.server_id,
        entry.direction,
        entry.message_type,
        entry.method,
        entry.payload_json,
        entry.timestamp,
      );
    } catch (error) {
      Logger.error('Failed to write MCP protocol log', error);
    }

    this.onLog(entry);
  }
}
