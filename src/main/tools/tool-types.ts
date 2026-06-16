import { ToolDefinition } from '../../shared/types';

/** 注入工具 handler 的运行时上下文（coding agent 用 workspace 锁定相对路径） */
export interface ToolContext {
  workspace: string;
  signal?: AbortSignal;
  permissionMode?: 'ask' | 'acceptEdits' | 'bypass';
}

export type ToolHandler = (
  params: Record<string, any>,
  ctx?: ToolContext,
) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  requiresApproval?: boolean;
}
