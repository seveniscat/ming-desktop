// Agent 相关类型
export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  skills: string[];
  enabled?: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  name: string;
  description?: string;
  model: string;
  systemPrompt: string;
  tools?: string[];
  skills?: string[];
}

export interface SkillParameter {
  name: string;
  label: string;
  type: 'select';
  options: { label: string; value: string }[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  folderPath: string;
  enabled: boolean;
  autoMessage?: string;
  parameters?: SkillParameter[];
  sourceType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillFile {
  name: string;
  path: string;
  content?: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

export interface SkillConfig {
  name: string;
  description?: string;
  folderPath?: string;
  enabled?: boolean;
}

export interface SkillSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  skills: Skill[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  type: 'system' | 'task';
  trigger: string;
  description: string;
  content: string;
  variables: string[];
  category: string | null;
  tags: string[];
  enabled: boolean;
  usage_count: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateConfig {
  name: string;
  type?: 'system' | 'task';
  trigger?: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  enabled?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

// Claude Agent SDK config types
export interface ClaudeAgentSDKHookConfig {
  event: string;
  command: string;
  filterPattern?: string;
}

export interface ClaudeAgentSDKMcpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeAgentSDKAgentDef {
  name: string;
  description: string;
  model?: string;
  prompt?: string;
}

export interface ClaudeAgentSDKConfig {
  hooks?: {
    preToolUse?: ClaudeAgentSDKHookConfig[];
    postToolUse?: ClaudeAgentSDKHookConfig[];
    stop?: ClaudeAgentSDKHookConfig[];
    sessionStart?: ClaudeAgentSDKHookConfig[];
    sessionEnd?: ClaudeAgentSDKHookConfig[];
  };
  mcpServers?: Record<string, ClaudeAgentSDKMcpServer>;
  agents?: ClaudeAgentSDKAgentDef[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
  allowedTools?: string[];
  sessionId?: string;
  forkSessionId?: string;
  maxTurns?: number;
  cwd?: string;
}

export type ModuleType = 'openai-compatible' | 'anthropic' | 'claude-agent-sdk';

// LLM Provider 相关类型
export interface LLMProvider {
  id: string;
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  sdkConfig?: ClaudeAgentSDKConfig;
}

export interface LLMProviderConfig {
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models?: string[];
  sdkConfig?: ClaudeAgentSDKConfig;
}

// 配置相关类型
export interface AppConfig {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  autoUpdate: boolean;
  colorTheme?: string;
  defaultLLMProvider?: string;
  workPaths: string[];
  /** 日报 Markdown 模板，占位符：{date} {total_commits} {total_repos} {work_hours} {commit_details} {stats} {generated_at} */
  dailyReportTemplate?: string;
  plugins?: Record<string, unknown>;
  agents: Agent[];
  skills: Skill[];
  llmProviders: LLMProvider[];
}

// 执行结果类型
export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

// 日报相关类型
export interface DailyReportConfig {
  repoPaths: string[];
  timeRange: 'today' | 'yesterday' | 'week';
  includeAllBranches: boolean;
  filterByAuthor?: string;
  outputDir: string;
  outputFormat: 'markdown' | 'txt' | 'json';
}

export interface DailyReport {
  date: string;
  totalCommits: number;
  totalRepos: number;
  workHours: number;
  details: string;
  stats: string;
  generatedAt: string;
}

// Streaming 相关
export interface StreamChunk {
  conversationId: string;
  content: string;
}

export interface StreamEnd {
  conversationId: string;
  fullContent: string;
  reasoningContent?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface StreamError {
  conversationId: string;
  error: string;
}

// Tool Calling 相关类型
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Tool persistence types
export interface ToolRecord {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string | null;
  parameters_schema: string | null;
  implementation_type: 'builtin' | 'http' | 'script';
  implementation_config: string | null;
  is_enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolCreateConfig {
  name: string;
  display_name: string;
  description?: string;
  category?: string;
  parameters_schema?: string;
  implementation_type?: 'builtin' | 'http' | 'script';
  implementation_config?: string;
  is_enabled?: boolean;
}

export interface ToolUpdateConfig {
  display_name?: string;
  description?: string;
  category?: string;
  parameters_schema?: string;
  implementation_type?: 'builtin' | 'http' | 'script';
  implementation_config?: string;
  is_enabled?: boolean;
}

// Debug 相关
export interface DebugModelCall {
  type: 'request' | 'response' | 'chunk' | 'tool' | 'error';
  timestamp: number;
  conversationId?: string;
  callId?: string;
  data: {
    provider?: string;
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    content?: string;
    rawContent?: string;
    reasoningContent?: string;
    tools?: string[];
    toolName?: string;
    toolArgs?: string;
    toolResult?: string;
    usage?: Record<string, any>;
    error?: string;
    duration?: number;
    chunkCount?: number;
  };
}

export type DebugLogCategory = 'llm' | 'ui';
export type DebugLogLevel = 'info' | 'warning' | 'error';

export interface UIStallReport {
  type: 'long-task' | 'event-loop';
  source?: string;
  duration: number;
  startedAt?: number;
  blockedFor?: number;
  name?: string;
  url?: string;
  visibilityState?: string;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  category: DebugLogCategory;
  type: string;
  level: DebugLogLevel;
  title: string;
  detail?: string;
  source?: string;
  conversationId?: string;
  callId?: string;
  duration?: number;
  data?: Record<string, any>;
}
