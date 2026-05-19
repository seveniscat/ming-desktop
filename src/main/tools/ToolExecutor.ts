import { BrowserWindow } from 'electron';
import { ToolDefinition, ToolCall } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { ToolApprovalManager } from './toolApproval';

export type ToolHandler = (params: Record<string, any>) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  requiresApproval?: boolean;
}

export class ToolExecutor {
  private tools: Map<string, ToolEntry> = new Map();
  private approvalManager: ToolApprovalManager | null = null;
  private mainWindow: BrowserWindow | null = null;

  register(entry: ToolEntry): void {
    this.tools.set(entry.definition.function.name, entry);
    Logger.info(`Tool registered: ${entry.definition.function.name}`);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  registerMcpTool(mcpToolName: string, definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(mcpToolName, { definition, handler });
    Logger.info(`MCP tool registered: ${mcpToolName}`);
  }

  clearMcpTools(): number {
    let removed = 0;
    for (const key of Array.from(this.tools.keys())) {
      if (key.startsWith('mcp__')) {
        this.tools.delete(key);
        removed++;
      }
    }
    return removed;
  }

  setApprovalManager(manager: ToolApprovalManager): void {
    this.approvalManager = manager;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getToolsForAgent(agentTools: string[]): ToolDefinition[] {
    return agentTools
      .map(name => this.tools.get(name))
      .filter(Boolean)
      .map(t => t!.definition);
  }

  async execute(toolCall: ToolCall): Promise<string> {
    const entry = this.tools.get(toolCall.function.name);
    if (!entry) {
      throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }
    const params = JSON.parse(toolCall.function.arguments);

    // Check if approval is required
    if (entry.requiresApproval && this.approvalManager && this.mainWindow) {
      const approved = await this.approvalManager.requestApproval(
        this.mainWindow, toolCall.function.name, params,
      );
      if (!approved) {
        return JSON.stringify({ error: 'User denied tool execution', tool: toolCall.function.name, denied: true });
      }
    }

    Logger.info(`Executing tool: ${toolCall.function.name}`, params);
    return entry.handler(params);
  }

  async executeByName(name: string, params: Record<string, any>): Promise<string> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Check if approval is required
    if (entry.requiresApproval && this.approvalManager && this.mainWindow) {
      const approved = await this.approvalManager.requestApproval(
        this.mainWindow, name, params,
      );
      if (!approved) {
        return JSON.stringify({ error: 'User denied tool execution', tool: name, denied: true });
      }
    }

    Logger.info(`Executing tool: ${name}`, params);
    return entry.handler(params);
  }
}
