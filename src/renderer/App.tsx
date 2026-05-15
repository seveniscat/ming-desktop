import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import { useState, useEffect, useCallback } from 'react';
import NavRail from './components/NavRail';
import Titlebar from './components/Titlebar';
import Welcome from './components/Welcome';
import Dashboard from './components/Dashboard';
import AgentChat from './components/AgentChat';
import AgentManager from './components/AgentManager';
import SkillManager from './components/SkillManager';
import PromptManager from './components/PromptManager';
import Settings from './components/Settings';
import TechStackAnalyzer from './components/TechStackAnalyzer';
import DebugPanel from './components/DebugPanel';
import ClientPerformanceMonitor from './components/ClientPerformanceMonitor';
import { ThemeProvider } from './components/ThemeProvider';

interface ElectronAPI {
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
    showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
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
  debug: {
    openPanel: () => Promise<void>;
    getLogs: () => Promise<any[]>;
    clearLogs: () => Promise<void>;
    reportUIStall: (report: any) => void;
    onModelCall: (callback: (data: any) => void) => () => void;
    onLogEvent: (callback: (data: any) => void) => () => void;
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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

interface ChatLaunchRequest {
  agentName: string;
  message: string;
  model?: string;
  newConversation?: boolean;
  reuseAgentConversation?: boolean;
  autoSend?: boolean;
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('welcome');
  const [chatLaunchRequest, setChatLaunchRequest] = useState<ChatLaunchRequest | null>(null);
  const isDebugView = new URLSearchParams(window.location.search).get('view') === 'debug';

  const handleStartChat = useCallback((request: ChatLaunchRequest) => {
    setChatLaunchRequest(request);
    setActiveTab('chat');
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!window.electronAPI) {
        setLoadError('Electron API 初始化失败，请重启应用');
        setIsLoading(false);
      }
    }, 3000);

    if (!window.electronAPI) {
      console.error('Electron API not available');
      setLoadError('Electron API 不可用');
      setIsLoading(false);
    } else {
      setLoadError(null);
      setIsLoading(false);
    }

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (isLoading) {
    return (
      <ThemeProvider>
        <ClientPerformanceMonitor source={isDebugView ? 'debug-window' : 'main-window'} />
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl mx-auto mb-4">铭</div>
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (loadError) {
    return (
      <ThemeProvider>
        <ClientPerformanceMonitor source={isDebugView ? 'debug-window' : 'main-window'} />
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <div className="mb-2 text-destructive">启动失败</div>
            <div className="text-sm text-muted-foreground">{loadError}</div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ClientPerformanceMonitor source={isDebugView ? 'debug-window' : 'main-window'} />
      {isDebugView ? (
        <DebugPanel />
      ) : (
        <div className="flex h-screen bg-background">
          {/* NavRail */}
          <NavRail activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Main area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Titlebar (drag region) */}
            <Titlebar />

            {/* Content */}
            <div className="flex-1 overflow-hidden w-full">
              {activeTab === 'welcome' && <Welcome />}
              {activeTab === 'techstack' && <TechStackAnalyzer />}
              {activeTab === 'dashboard' && <Dashboard onStartChat={handleStartChat} />}
              {activeTab === 'chat' && (
                <AgentChat
                  launchRequest={chatLaunchRequest}
                  onLaunchHandled={() => setChatLaunchRequest(null)}
                />
              )}
              {activeTab === 'agents' && <AgentManager />}
              {activeTab === 'skills' && <SkillManager />}
              {activeTab === 'prompts' && <PromptManager />}
              {activeTab === 'settings' && <Settings />}
            </div>
          </div>
        </div>
      )}
    </ThemeProvider>
  );
}

export default App;
