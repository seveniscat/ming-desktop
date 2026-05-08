import { ToolDefinition, ToolCall } from '../../shared/types';
import { Logger } from '../utils/Logger';

export type ToolHandler = (params: Record<string, any>) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolExecutor {
  private tools: Map<string, ToolEntry> = new Map();

  register(entry: ToolEntry): void {
    this.tools.set(entry.definition.function.name, entry);
    Logger.info(`Tool registered: ${entry.definition.function.name}`);
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
    Logger.info(`Executing tool: ${toolCall.function.name}`, params);
    return entry.handler(params);
  }
}
