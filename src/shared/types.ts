// 插件相关类型
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  category: string;
  entry: string;
  configSchema?: any;
  enabled: boolean;
}

export interface PluginConfig {
  pluginId: string;
  config: Record<string, any>;
}

export interface PluginExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  logs?: string[];
}

// Agent 相关类型
export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  name: string;
  description?: string;
  model: string;
  systemPrompt: string;
  tools?: string[];
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

// LLM Provider 相关类型
export interface LLMProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'local' | 'custom' | 'qwen' | 'deepseek';
  apiKey?: string;
  baseURL?: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
}

export interface LLMProviderConfig {
  name: string;
  type: LLMProvider['type'];
  apiKey?: string;
  baseURL?: string;
  models?: string[];
}

// 配置相关类型
export interface AppConfig {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  autoUpdate: boolean;
  defaultLLMProvider?: string;
  workPaths: string[];
  /** 日报 Markdown 模板，占位符：{date} {total_commits} {total_repos} {work_hours} {commit_details} {stats} {generated_at} */
  dailyReportTemplate?: string;
  /** Daily Reporter Agent 的系统提示词 */
  dailyReporterSystemPrompt?: string;
  /** 日报生成使用的 LLM Provider ID */
  dailyReportProvider?: string;
  /** 日报生成使用的模型名称 */
  dailyReportModel?: string;
  plugins: Record<string, PluginConfig>;
  agents: Agent[];
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

// Debug 相关
export interface DebugModelCall {
  type: 'request' | 'response' | 'chunk' | 'error';
  timestamp: number;
  data: {
    provider?: string;
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    content?: string;
    usage?: Record<string, any>;
    error?: string;
    duration?: number;
  };
}
