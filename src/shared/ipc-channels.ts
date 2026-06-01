// IPC 通道名称常量
export enum IPCChannels {
  // Agent 相关
  AGENT_CREATE = 'agent:create',
  AGENT_CHAT = 'agent:chat',
  AGENT_LIST = 'agent:list',
  AGENT_DELETE = 'agent:delete',
  AGENT_UPDATE = 'agent:update',

  // Skill 相关
  SKILL_CREATE = 'skill:create',
  SKILL_LIST = 'skill:list',
  SKILL_DELETE = 'skill:delete',
  SKILL_UPDATE = 'skill:update',
  SKILL_SYNC_LOCAL = 'skill:sync-local',
  SKILL_GET_FILES = 'skill:get-files',
  SKILL_READ_FILE = 'skill:read-file',
  SKILL_WRITE_FILE = 'skill:write-file',
  SKILL_DELETE_FILE = 'skill:delete-file',

  // Prompt 相关
  PROMPT_CREATE = 'prompt:create',
  PROMPT_LIST = 'prompt:list',
  PROMPT_DELETE = 'prompt:delete',
  PROMPT_UPDATE = 'prompt:update',
  PROMPT_TEST = 'prompt:test',

  // LLM Provider 相关
  LLM_LIST_PROVIDERS = 'llm:list-providers',
  LLM_CHAT = 'llm:chat',
  LLM_ADD_PROVIDER = 'llm:add-provider',
  LLM_REMOVE_PROVIDER = 'llm:remove-provider',
  LLM_UPDATE_PROVIDER = 'llm:update-provider',
  LLM_FETCH_MODELS = 'llm:fetch-models',
  LLM_TEST_CONNECTION = 'llm:test-connection',

  // 执行服务相关
  EXECUTE_COMMAND = 'executor:execute-command',
  EXECUTE_SCRIPT = 'executor:execute-script',
  EXECUTE_TERMINAL = 'executor:execute-terminal',

  // 配置相关
  CONFIG_GET = 'config:get',
  CONFIG_SET = 'config:set',
  CONFIG_GET_ALL = 'config:get-all',
  CONFIG_RESET = 'config:reset',

  // 文件系统相关
  FS_READ_FILE = 'fs:read-file',
  FS_WRITE_FILE = 'fs:write-file',
  FS_READ_DIR = 'fs:read-dir',
  FS_EXISTS = 'fs:exists',

  // 系统相关
  SYS_GET_OS_INFO = 'sys:get-os-info',
  SYS_GET_VERSION = 'sys:get-version',

  // 对话框相关
  DIALOG_SHOW_OPEN_DIALOG = 'dialog:show-open-dialog',

  // Shell 相关
  SHELL_OPEN_EXTERNAL = 'shell:open-external',

  // Git 相关
  GIT_SCAN_REPOS = 'git:scan-repos',
  GIT_GET_USER = 'git:get-user',
  GIT_GET_ALL_AUTHORS = 'git:get-all-authors',
  GIT_HEATMAP = 'git:heatmap',
  GIT_CLEAR_CACHE = 'git:clear-cache',
  GIT_GET_MY_IDENTITIES = 'git:get-my-identities',
  GIT_SET_MY_IDENTITIES = 'git:set-my-identities',
  DAILY_REPORT_FETCH = 'daily-report:fetch',
  DAILY_REPORT_SAVE = 'daily-report:save',
  DAILY_REPORT_LIST = 'daily-report:list',
  DAILY_REPORT_DELETE = 'daily-report:delete',

  // Conversation 相关
  CONVERSATION_CREATE = 'conversation:create',
  CONVERSATION_LIST = 'conversation:list',
  CONVERSATION_MESSAGES = 'conversation:messages',
  CONVERSATION_DELETE = 'conversation:delete',
  CONVERSATION_RENAME = 'conversation:rename',
  CONVERSATION_CHAT = 'conversation:chat',

  CONVERSATION_CHAT_ABORT = 'conversation:chat-abort',

  // Streaming 相关
  CONVERSATION_STREAM_CHUNK = 'conversation:stream-chunk',
  CONVERSATION_STREAM_END = 'conversation:stream-end',
  CONVERSATION_STREAM_ERROR = 'conversation:stream-error',
  CONVERSATION_STREAM_TOOL_EVENT = 'conversation:stream-tool-event',

  // Debug 相关
  DEBUG_MODEL_CALL = 'debug:model-call',
  DEBUG_OPEN_PANEL = 'debug:open-panel',
  DEBUG_GET_LOGS = 'debug:get-logs',
  DEBUG_CLEAR_LOGS = 'debug:clear-logs',
  DEBUG_LOG_EVENT = 'debug:log-event',
  DEBUG_REPORT_UI_STALL = 'debug:report-ui-stall',

  // TechStack 分析相关
  ANALYZE_APP = 'analyze:app',
  ANALYZE_PROJECT = 'analyze:project',

  // Tool 相关
  TOOL_LIST = 'tool:list',
  TOOL_GET = 'tool:get',
  TOOL_CREATE = 'tool:create',
  TOOL_UPDATE = 'tool:update',
  TOOL_DELETE = 'tool:delete',
  TOOL_EXECUTE = 'tool:execute',
  TOOL_APPROVAL_REQUEST = 'tool:approval-request',
  TOOL_APPROVAL_RESPONSE = 'tool:approval-response',

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

  // Memory 相关
  MEMORY_LIST = 'memory:list',
  MEMORY_GET = 'memory:get',
  MEMORY_CREATE = 'memory:create',
  MEMORY_UPDATE = 'memory:update',
  MEMORY_DELETE = 'memory:delete',
  MEMORY_PREVIEW = 'memory:preview',
  MEMORY_SEARCH = 'memory:search',
}
