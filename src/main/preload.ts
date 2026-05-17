import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannels } from '../shared/ipc-channels';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // Agent API
  agents: {
    create: (config: any) => ipcRenderer.invoke(IPCChannels.AGENT_CREATE, config),
    chat: (agentId: string, message: string) =>
      ipcRenderer.invoke(IPCChannels.AGENT_CHAT, agentId, message),
    list: () => ipcRenderer.invoke(IPCChannels.AGENT_LIST),
    update: (agentId: string, updates: any) =>
      ipcRenderer.invoke(IPCChannels.AGENT_UPDATE, agentId, updates),
    delete: (agentId: string) =>
      ipcRenderer.invoke(IPCChannels.AGENT_DELETE, agentId),
  },

  // Skill API
  skills: {
    create: (config: any) => ipcRenderer.invoke(IPCChannels.SKILL_CREATE, config),
    list: () => ipcRenderer.invoke(IPCChannels.SKILL_LIST),
    update: (skillId: string, updates: any) =>
      ipcRenderer.invoke(IPCChannels.SKILL_UPDATE, skillId, updates),
    delete: (skillId: string) =>
      ipcRenderer.invoke(IPCChannels.SKILL_DELETE, skillId),
    syncLocal: () => ipcRenderer.invoke(IPCChannels.SKILL_SYNC_LOCAL),
  },

  // Prompt API
  prompts: {
    create: (config: any) => ipcRenderer.invoke(IPCChannels.PROMPT_CREATE, config),
    list: () => ipcRenderer.invoke(IPCChannels.PROMPT_LIST),
    update: (promptId: string, updates: any) =>
      ipcRenderer.invoke(IPCChannels.PROMPT_UPDATE, promptId, updates),
    delete: (promptId: string) =>
      ipcRenderer.invoke(IPCChannels.PROMPT_DELETE, promptId),
    test: (renderedContent: string, model?: string) =>
      ipcRenderer.invoke(IPCChannels.PROMPT_TEST, renderedContent, model),
  },

  // Conversation API
  conversations: {
    create: () => ipcRenderer.invoke(IPCChannels.CONVERSATION_CREATE),
    list: () => ipcRenderer.invoke(IPCChannels.CONVERSATION_LIST),
    messages: (conversationId: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_MESSAGES, conversationId),
    delete: (conversationId: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_DELETE, conversationId),
    rename: (conversationId: string, title: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_RENAME, conversationId, title),
    // Changed: fire-and-forget, response comes via stream events
    chat: (conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => {
      ipcRenderer.send(IPCChannels.CONVERSATION_CHAT, conversationId, agentId, message, model, injectedSkills);
    },
    abort: (conversationId: string) => {
      ipcRenderer.send(IPCChannels.CONVERSATION_CHAT_ABORT, conversationId);
    },
    // Streaming listeners — each returns an unsubscribe function
    onStreamChunk: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_CHUNK, listener);
      return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_CHUNK, listener);
    },
    onStreamEnd: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_END, listener);
      return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_END, listener);
    },
    onStreamError: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_ERROR, listener);
      return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_ERROR, listener);
    },
    onStreamToolEvent: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_TOOL_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_TOOL_EVENT, listener);
    },
  },

  // Debug API
  debug: {
    openPanel: () => ipcRenderer.invoke(IPCChannels.DEBUG_OPEN_PANEL),
    getLogs: () => ipcRenderer.invoke(IPCChannels.DEBUG_GET_LOGS),
    clearLogs: () => ipcRenderer.invoke(IPCChannels.DEBUG_CLEAR_LOGS),
    reportUIStall: (report: any) => ipcRenderer.send(IPCChannels.DEBUG_REPORT_UI_STALL, report),
    onModelCall: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.DEBUG_MODEL_CALL, listener);
      return () => ipcRenderer.removeListener(IPCChannels.DEBUG_MODEL_CALL, listener);
    },
    onLogEvent: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.DEBUG_LOG_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.DEBUG_LOG_EVENT, listener);
    },
  },

  // LLM API
  llm: {
    listProviders: () => ipcRenderer.invoke(IPCChannels.LLM_LIST_PROVIDERS),
    chat: (providerId: string, messages: any[]) =>
      ipcRenderer.invoke(IPCChannels.LLM_CHAT, providerId, messages),
    addProvider: (config: any) => ipcRenderer.invoke(IPCChannels.LLM_ADD_PROVIDER, config),
    removeProvider: (providerId: string) =>
      ipcRenderer.invoke(IPCChannels.LLM_REMOVE_PROVIDER, providerId),
    updateProvider: (providerId: string, updates: any) =>
      ipcRenderer.invoke(IPCChannels.LLM_UPDATE_PROVIDER, providerId, updates),
    fetchModels: (providerId: string) =>
      ipcRenderer.invoke(IPCChannels.LLM_FETCH_MODELS, providerId),
  },

  // 执行 API
  executor: {
    executeCommand: (command: string, options?: any) =>
      ipcRenderer.invoke(IPCChannels.EXECUTE_COMMAND, command, options),
    executeScript: (script: string, args?: any) =>
      ipcRenderer.invoke(IPCChannels.EXECUTE_SCRIPT, script, args),
  },

  // 配置 API
  config: {
    get: (key: string) => ipcRenderer.invoke(IPCChannels.CONFIG_GET, key),
    set: (key: string, value: any) => ipcRenderer.invoke(IPCChannels.CONFIG_SET, key, value),
    getAll: () => ipcRenderer.invoke(IPCChannels.CONFIG_GET_ALL),
  },

  // 对话框 API
  dialog: {
    showOpenDialog: (options: Electron.OpenDialogOptions) =>
      ipcRenderer.invoke(IPCChannels.DIALOG_SHOW_OPEN_DIALOG, options),
  },

  // Git API
  git: {
    scanRepos: () => ipcRenderer.invoke(IPCChannels.GIT_SCAN_REPOS),
    getUser: () => ipcRenderer.invoke(IPCChannels.GIT_GET_USER),
    getAllAuthors: () => ipcRenderer.invoke(IPCChannels.GIT_GET_ALL_AUTHORS),
    heatmap: (authors?: string[]) => ipcRenderer.invoke(IPCChannels.GIT_HEATMAP, authors),
    clearCache: () => ipcRenderer.invoke(IPCChannels.GIT_CLEAR_CACHE),
    getMyIdentities: () => ipcRenderer.invoke(IPCChannels.GIT_GET_MY_IDENTITIES),
    setMyIdentities: (identities: { name: string; email: string }[]) =>
      ipcRenderer.invoke(IPCChannels.GIT_SET_MY_IDENTITIES, identities),
  },

  // Daily Report API
  dailyReport: {
    fetch: (params: any) => ipcRenderer.invoke(IPCChannels.DAILY_REPORT_FETCH, params),
    save: (report: { title: string; content: string; timeRange: string; commitsCount: number; reposCount: number }) =>
      ipcRenderer.invoke(IPCChannels.DAILY_REPORT_SAVE, report),
    list: () => ipcRenderer.invoke(IPCChannels.DAILY_REPORT_LIST),
    delete: (id: number) => ipcRenderer.invoke(IPCChannels.DAILY_REPORT_DELETE, id),
  },

  // TechStack 分析 API
  techStack: {
    analyzeApp: (filePath: string) => ipcRenderer.invoke(IPCChannels.ANALYZE_APP, filePath),
    analyzeProject: (dirPath: string) => ipcRenderer.invoke(IPCChannels.ANALYZE_PROJECT, dirPath),
  },

  // Tool API
  tools: {
    list: () => ipcRenderer.invoke(IPCChannels.TOOL_LIST),
    get: (toolId: string) => ipcRenderer.invoke(IPCChannels.TOOL_GET, toolId),
    create: (config: any) => ipcRenderer.invoke(IPCChannels.TOOL_CREATE, config),
    update: (toolId: string, updates: any) => ipcRenderer.invoke(IPCChannels.TOOL_UPDATE, toolId, updates),
    delete: (toolId: string) => ipcRenderer.invoke(IPCChannels.TOOL_DELETE, toolId),
    execute: (toolId: string, params: any) => ipcRenderer.invoke(IPCChannels.TOOL_EXECUTE, toolId, params),
    onApprovalRequest: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.TOOL_APPROVAL_REQUEST, listener);
      return () => ipcRenderer.removeListener(IPCChannels.TOOL_APPROVAL_REQUEST, listener);
    },
    respondApproval: (requestId: string, approved: boolean) => {
      ipcRenderer.send(IPCChannels.TOOL_APPROVAL_RESPONSE, requestId, approved);
    },
  },

  // MCP Server API
  mcpServers: {
    list: () => ipcRenderer.invoke(IPCChannels.MCP_SERVER_LIST),
    get: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_GET, serverId),
    create: (config: any) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_CREATE, config),
    update: (serverId: string, updates: any) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_UPDATE, serverId, updates),
    delete: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_DELETE, serverId),
    connect: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_CONNECT, serverId),
    disconnect: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_DISCONNECT, serverId),
    refreshTools: (serverId: string) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_REFRESH_TOOLS, serverId),
    callTool: (serverId: string, toolName: string, args: any) => ipcRenderer.invoke(IPCChannels.MCP_SERVER_CALL_TOOL, serverId, toolName, args),
    onStatusChange: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.MCP_SERVER_STATUS_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.MCP_SERVER_STATUS_EVENT, listener);
    },
    onToolsChange: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.MCP_SERVER_TOOLS_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.MCP_SERVER_TOOLS_EVENT, listener);
    },
  },

  // MCP Debug API
  mcpDebug: {
    getLogs: (serverId?: string) => ipcRenderer.invoke(IPCChannels.MCP_DEBUG_LOGS, serverId),
    clearLogs: (serverId?: string) => ipcRenderer.invoke(IPCChannels.MCP_DEBUG_CLEAR, serverId),
    exportLogs: (serverId?: string) => ipcRenderer.invoke(IPCChannels.MCP_DEBUG_EXPORT, serverId),
    onLogEvent: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.MCP_DEBUG_LOG_EVENT, listener);
      return () => ipcRenderer.removeListener(IPCChannels.MCP_DEBUG_LOG_EVENT, listener);
    },
  },
});

// 类型定义
export interface ElectronAPI {
  agents: {
    create: (config: any) => Promise<string>;
    chat: (agentId: string, message: string) => Promise<string>;
    list: () => Promise<any[]>;
    update: (agentId: string, updates: any) => Promise<void>;
    delete: (agentId: string) => Promise<void>;
  };
  skills: {
    create: (config: any) => Promise<string>;
    list: () => Promise<any[]>;
    update: (skillId: string, updates: any) => Promise<void>;
    delete: (skillId: string) => Promise<void>;
    syncLocal: () => Promise<any>;
  };
  prompts: {
    create: (config: any) => Promise<string>;
    list: () => Promise<any[]>;
    update: (promptId: string, updates: any) => Promise<void>;
    delete: (promptId: string) => Promise<void>;
    test: (renderedContent: string, model?: string) => Promise<string>;
  };
  conversations: {
    create: () => Promise<any>;
    list: () => Promise<any[]>;
    messages: (conversationId: string) => Promise<any[]>;
    delete: (conversationId: string) => Promise<void>;
    rename: (conversationId: string, title: string) => Promise<void>;
    chat: (conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => void;
    abort: (conversationId: string) => void;
    onStreamChunk: (callback: (data: any) => void) => () => void;
    onStreamEnd: (callback: (data: any) => void) => () => void;
    onStreamError: (callback: (data: any) => void) => () => void;
    onStreamToolEvent: (callback: (data: any) => void) => () => void;
  };
  llm: {
    listProviders: () => Promise<any[]>;
    chat: (providerId: string, messages: any[]) => Promise<string>;
    addProvider: (config: any) => Promise<any>;
    removeProvider: (providerId: string) => Promise<void>;
    updateProvider: (providerId: string, updates: any) => Promise<void>;
    fetchModels: (providerId: string) => Promise<string[]>;
  };
  executor: {
    executeCommand: (command: string, options?: any) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    executeScript: (script: string, args?: any) => Promise<any>;
  };
  config: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    getAll: () => Promise<any>;
  };
  dialog: {
    showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  };
  debug: {
    openPanel: () => Promise<void>;
    getLogs: () => Promise<any[]>;
    clearLogs: () => Promise<void>;
    reportUIStall: (report: any) => void;
    onModelCall: (callback: (data: any) => void) => () => void;
    onLogEvent: (callback: (data: any) => void) => () => void;
  };
  git: {
    scanRepos: () => Promise<{ name: string; path: string }[]>;
    getUser: () => Promise<{ name: string; email: string }>;
    heatmap: (authors?: string[]) => Promise<{
      data: Record<string, number>;
      stats: {
        totalCommits: number;
        longestStreak: number;
        currentStreak: number;
        mostActiveMonth: string;
        mostActiveDay: string;
      };
    }>;
    getMyIdentities: () => Promise<{ name: string; email: string }[]>;
    setMyIdentities: (identities: { name: string; email: string }[]) => Promise<void>;
  };
  dailyReport: {
    fetch: (params: any) => Promise<any>;
    save: (report: { title: string; content: string; timeRange: string; commitsCount: number; reposCount: number }) => Promise<{ id: number }>;
    list: () => Promise<any[]>;
    delete: (id: number) => Promise<{ success: boolean }>;
  };
  techStack: {
    analyzeApp: (filePath: string) => Promise<any>;
    analyzeProject: (dirPath: string) => Promise<any>;
  };
  tools: {
    list: () => Promise<any[]>;
    get: (toolId: string) => Promise<any>;
    create: (config: any) => Promise<string>;
    update: (toolId: string, updates: any) => Promise<void>;
    delete: (toolId: string) => Promise<void>;
    execute: (toolId: string, params: any) => Promise<{ result: string; duration: number }>;
    onApprovalRequest: (callback: (data: any) => void) => () => void;
    respondApproval: (requestId: string, approved: boolean) => void;
  };
  mcpServers: {
    list: () => Promise<any[]>;
    get: (serverId: string) => Promise<any>;
    create: (config: any) => Promise<string>;
    update: (serverId: string, updates: any) => Promise<void>;
    delete: (serverId: string) => Promise<void>;
    connect: (serverId: string) => Promise<void>;
    disconnect: (serverId: string) => Promise<void>;
    refreshTools: (serverId: string) => Promise<any[]>;
    callTool: (serverId: string, toolName: string, args: any) => Promise<any>;
    onStatusChange: (callback: (data: any) => void) => () => void;
    onToolsChange: (callback: (data: any) => void) => () => void;
  };
  mcpDebug: {
    getLogs: (serverId?: string) => Promise<any[]>;
    clearLogs: (serverId?: string) => Promise<void>;
    exportLogs: (serverId?: string) => Promise<string>;
    onLogEvent: (callback: (data: any) => void) => () => void;
  };
}
