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
import ToolsPage from './pages/ToolsPage';
import DebugPanel from './components/DebugPanel';
import ClientPerformanceMonitor from './components/ClientPerformanceMonitor';
import { ThemeProvider } from './components/ThemeProvider';

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
              {activeTab === 'tools' && <ToolsPage />}
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
