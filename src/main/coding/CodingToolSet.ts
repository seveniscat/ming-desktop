import { ToolDefinition } from '../../shared/types';
import { ToolEntry, ToolContext } from '../tools/tool-types';
import { ToolRuntime } from './CodingAgent';
import { ExecutorService } from '../services/ExecutorService';
import { createReadFileTool } from '../tools/readFileTool';
import { createWriteFileTool } from '../tools/writeFileTool';
import { createListDirectoryTool } from '../tools/listDirectoryTool';
import { createSearchFilesTool } from '../tools/searchFilesTool';
import { createExecuteCommandTool } from '../tools/executeCommandTool';
import { createEditFileTool } from './codingTools/editFileTool';
import { createGlobTool } from './codingTools/globTool';
import { createGrepTool } from './codingTools/grepTool';

/**
 * 绑定到单个 workspace 的 coding 工具集，实现 ToolRuntime。
 * execute 时把 workspace 注入 ToolContext；底层工具据此解析相对路径。
 */
export class CodingToolSet implements ToolRuntime {
  private tools: Map<string, ToolEntry>;

  constructor(private workspace: string, executorService: ExecutorService) {
    const entries: ToolEntry[] = [
      createReadFileTool(),
      createWriteFileTool(),
      createEditFileTool(),
      createListDirectoryTool(),
      createSearchFilesTool(),
      createGlobTool(),
      createGrepTool(),
      createExecuteCommandTool(executorService),
    ];
    this.tools = new Map(entries.map((e) => [e.definition.function.name, e]));
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((e) => e.definition);
  }

  async execute(name: string, params: Record<string, any>, ctx: ToolContext): Promise<string> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const fullCtx: ToolContext = { ...ctx, workspace: this.workspace };
    return entry.handler(params, fullCtx);
  }
}
