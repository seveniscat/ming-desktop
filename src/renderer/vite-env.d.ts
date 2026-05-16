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
    };
    prompts: {
      create: (config: any) => Promise<any>;
      list: () => Promise<any>;
      update: (promptId: string, updates: any) => Promise<any>;
      delete: (promptId: string) => Promise<any>;
      test: (renderedContent: string, model?: string) => Promise<string>;
    };
    conversations: {
      create: (data: any) => Promise<any>;
      list: () => Promise<any>;
      messages: (conversationId: string) => Promise<any>;
      delete: (conversationId: string) => Promise<any>;
      rename: (conversationId: string, title: string) => Promise<any>;
      chat: (conversationId: string, message: string, options?: any) => Promise<any>;
      abort: (conversationId: string) => Promise<any>;
      onStreamChunk: (callback: (data: any) => void) => () => void;
      onStreamEnd: (callback: (data: any) => void) => () => void;
      onStreamError: (callback: (data: any) => void) => () => void;
      onStreamToolEvent: (callback: (data: any) => void) => () => void;
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
  };
}
