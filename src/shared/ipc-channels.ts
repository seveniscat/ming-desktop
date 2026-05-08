// IPC 通道名称常量
export enum IPCChannels {
  // Agent 相关
  AGENT_CREATE = 'agent:create',
  AGENT_CHAT = 'agent:chat',
  AGENT_LIST = 'agent:list',
  AGENT_DELETE = 'agent:delete',

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

  // Conversation 相关
  CONVERSATION_CREATE = 'conversation:create',
  CONVERSATION_LIST = 'conversation:list',
  CONVERSATION_MESSAGES = 'conversation:messages',
  CONVERSATION_DELETE = 'conversation:delete',
  CONVERSATION_RENAME = 'conversation:rename',
  CONVERSATION_CHAT = 'conversation:chat',

  // Streaming 相关
  CONVERSATION_STREAM_CHUNK = 'conversation:stream-chunk',
  CONVERSATION_STREAM_END = 'conversation:stream-end',
  CONVERSATION_STREAM_ERROR = 'conversation:stream-error',

  // Debug 相关
  DEBUG_MODEL_CALL = 'debug:model-call',
}
