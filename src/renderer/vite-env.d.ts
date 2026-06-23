/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    agents: {
      create: (config: any) => Promise<any>;
      chat: (agentId: string, message: string) => Promise<any>;
      list: () => Promise<any>;
      update: (agentId: string, updates: any) => Promise<any>;
      delete: (agentId: string) => Promise<any>;
    };
    skills: {
      create: (config: any) => Promise<any>;
      list: () => Promise<any>;
      update: (skillId: string, updates: any) => Promise<any>;
      delete: (skillId: string) => Promise<any>;
      syncLocal: () => Promise<any>;
      importZip: (zipPath: string) => Promise<{ skillId: string; skillName: string }>;
    };
    prompts: {
      create: (config: any) => Promise<any>;
      list: () => Promise<any>;
      update: (promptId: string, updates: any) => Promise<any>;
      delete: (promptId: string) => Promise<any>;
      test: (renderedContent: string, model?: string) => Promise<string>;
    };
    conversations: {
      create: () => Promise<any>;
      list: () => Promise<any>;
      messages: (conversationId: string) => Promise<any>;
      delete: (conversationId: string) => Promise<any>;
      rename: (conversationId: string, title: string) => Promise<any>;
      chat: (conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => void;
      abort: (conversationId: string) => void;
      onStreamChunk: (callback: (data: any) => void) => () => void;
      onStreamReasoningChunk: (callback: (data: any) => void) => () => void;
      onStreamEnd: (callback: (data: any) => void) => () => void;
      onStreamError: (callback: (data: any) => void) => () => void;
      onStreamToolEvent: (callback: (data: any) => void) => () => void;
    };
    coding: {
      create: (workspace: string, model: string, systemPrompt?: string, maxTurns?: number) => Promise<string>;
      list: () => Promise<any[]>;
      dispose: (sessionId: string) => Promise<void>;
      send: (sessionId: string, prompt: string) => void;
      stop: (sessionId: string) => void;
      onChunk: (callback: (data: any) => void) => () => void;
      onToolEvent: (callback: (data: any) => void) => () => void;
      onEnd: (callback: (data: any) => void) => () => void;
      onError: (callback: (data: any) => void) => () => void;
    };
    debug: {
      openPanel: () => Promise<any>;
      getLogs: () => Promise<any>;
      clearLogs: () => Promise<any>;
      reportUIStall: (report: any) => void;
      onModelCall: (callback: (data: any) => void) => () => void;
      onLogEvent: (callback: (data: any) => void) => () => void;
    };
    llm: {
      listProviders: () => Promise<any>;
      chat: (providerId: string, messages: any[]) => Promise<any>;
      addProvider: (config: any) => Promise<any>;
      removeProvider: (providerId: string) => Promise<any>;
      updateProvider: (providerId: string, updates: any) => Promise<any>;
      fetchModels: (providerId: string) => Promise<any>;
      testConnection: (providerId: string) => Promise<{ success: boolean; message: string }>;
      importFromCcSwitch: () => Promise<{ total: number; created: number; skipped: number; providers: any[]; source: string }>;
    };
    executor: {
      executeCommand: (command: string, options?: any) => Promise<any>;
      executeScript: (script: string, args?: any) => Promise<any>;
    };
    config: {
      get: (key: string) => Promise<any>;
      set: (key: string, value: any) => Promise<any>;
      getAll: () => Promise<any>;
    };
    dialog: {
      showOpenDialog: (options: any) => Promise<any>;
    };
    shell: {
      openExternal: (url: string) => Promise<void>;
    };
    git: {
      scanRepos: () => Promise<{ name: string; path: string }[]>;
      getUser: () => Promise<{ name: string; email: string }>;
      getAllAuthors: () => Promise<{ name: string; email: string }[]>;
      heatmap: (authors?: string[]) => Promise<{ data: Record<string, number>; stats: { totalCommits: number; longestStreak: number; currentStreak: number; mostActiveMonth: string; mostActiveDay: string } }>;
      clearCache: () => Promise<{ success: boolean }>;
      getMyIdentities: () => Promise<{ name: string; email: string }[]>;
      setMyIdentities: (identities: { name: string; email: string }[]) => Promise<void>;
    };
    dailyReport: {
      fetch: (params: any) => Promise<any>;
      save: (report: { title: string; content: string; timeRange: string; commitsCount: number; reposCount: number }) => Promise<any>;
      list: () => Promise<any>;
      delete: (id: number) => Promise<any>;
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
    memories: {
      list: (filters?: any) => Promise<any[]>;
      get: (id: string) => Promise<any>;
      create: (data: any) => Promise<any>;
      update: (id: string, data: any) => Promise<any>;
      delete: (id: string) => Promise<void>;
      preview: () => Promise<{ text: string; tokens: number }>;
      search: (query: string, limit?: number) => Promise<any[]>;
    };
  };
}
