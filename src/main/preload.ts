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
    chat: (conversationId: string, agentId: string, message: string, model?: string) => {
      ipcRenderer.send(IPCChannels.CONVERSATION_CHAT, conversationId, agentId, message, model);
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
    heatmap: () => ipcRenderer.invoke(IPCChannels.GIT_HEATMAP),
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
  };
  conversations: {
    create: () => Promise<any>;
    list: () => Promise<any[]>;
    messages: (conversationId: string) => Promise<any[]>;
    delete: (conversationId: string) => Promise<void>;
    rename: (conversationId: string, title: string) => Promise<void>;
    chat: (conversationId: string, agentId: string, message: string, model?: string) => void;
    abort: (conversationId: string) => void;
    onStreamChunk: (callback: (data: any) => void) => () => void;
    onStreamEnd: (callback: (data: any) => void) => () => void;
    onStreamError: (callback: (data: any) => void) => () => void;
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
    heatmap: () => Promise<{
      data: Record<string, number>;
      stats: {
        totalCommits: number;
        longestStreak: number;
        currentStreak: number;
        mostActiveMonth: string;
        mostActiveDay: string;
      };
    }>;
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
}
