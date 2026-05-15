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

  // Prompt 相关
  PROMPT_CREATE = 'prompt:create',
  PROMPT_LIST = 'prompt:list',
  PROMPT_DELETE = 'prompt:delete',
  PROMPT_UPDATE = 'prompt:update',

  // LLM Provider 相关
  LLM_LIST_PROVIDERS = 'llm:list-providers',
  LLM_CHAT = 'llm:chat',
  LLM_ADD_PROVIDER = 'llm:add-provider',
  LLM_REMOVE_PROVIDER = 'llm:remove-provider',
  LLM_UPDATE_PROVIDER = 'llm:update-provider',
  LLM_FETCH_MODELS = 'llm:fetch-models',

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

  // Git 相关
  GIT_SCAN_REPOS = 'git:scan-repos',
  GIT_GET_USER = 'git:get-user',
  GIT_GET_ALL_AUTHORS = 'git:get-all-authors',
  GIT_HEATMAP = 'git:heatmap',
  GIT_CLEAR_CACHE = 'git:clear-cache',
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
}
