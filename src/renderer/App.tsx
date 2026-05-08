import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AgentChat from './components/AgentChat';
import Settings from './components/Settings';
import { themePresets, defaultThemeName, applyThemePreset, type ThemePreset } from './lib/themes';

interface ElectronAPI {
  agents: {
    create: (config: any) => Promise<string>;
    chat: (agentId: string, message: string) => Promise<string>;
    list: () => Promise<any[]>;
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
  git: {
    scanRepos: () => Promise<{ name: string; path: string }[]>;
  };
  conversations: {
    create: () => Promise<any>;
    list: () => Promise<any[]>;
    messages: (conversationId: string) => Promise<any[]>;
    delete: (conversationId: string) => Promise<void>;
    rename: (conversationId: string, title: string) => Promise<void>;
    chat: (conversationId: string, agentId: string, message: string, model?: string) => void;
    onStreamChunk: (callback: (data: any) => void) => () => void;
    onStreamEnd: (callback: (data: any) => void) => () => void;
    onStreamError: (callback: (data: any) => void) => () => void;
  };
  debug: {
    onModelCall: (callback: (data: any) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Theme context
type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  colorTheme: string;
  setColorTheme: (name: string) => void;
  colorPresets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => {},
  colorTheme: defaultThemeName,
  setColorTheme: () => {},
  colorPresets: themePresets,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');
  const [colorTheme, setColorThemeState] = useState(defaultThemeName);

  const applyAll = useCallback((t: Theme, colorName: string, resolved?: 'light' | 'dark') => {
    const r = resolved || (t === 'auto' ? getSystemTheme() : t);
    setResolvedTheme(r);
    document.documentElement.classList.toggle('dark', r === 'dark');
    const preset = themePresets.find(p => p.name === colorName) || themePresets[0];
    applyThemePreset(preset, r);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyAll(t, colorTheme);
    window.electronAPI?.config.set('theme', t);
  }, [applyAll, colorTheme]);

  const setColorTheme = useCallback((name: string) => {
    setColorThemeState(name);
    applyAll(theme, name);
    window.electronAPI?.config.set('colorTheme', name);
  }, [applyAll, theme]);

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      const saved = await window.electronAPI?.config.get('theme');
      const savedColor = await window.electronAPI?.config.get('colorTheme');
      const t = saved || 'dark';
      const c = savedColor || defaultThemeName;
      setThemeState(t);
      setColorThemeState(c);
      applyAll(t, c);
    };
    loadTheme();

    const handler = () => {
      if (theme === 'auto') applyAll('auto', colorTheme);
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler);
    return () => {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handler);
    };
  }, [applyAll, theme, colorTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, colorTheme, setColorTheme, colorPresets: themePresets }}>
      {children}
    </ThemeContext.Provider>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

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
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <div className="text-4xl mb-4">銘</div>
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (loadError) {
    return (
      <ThemeProvider>
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
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main content with drag bar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* macOS drag bar */}
          <div className="drag-region flex-shrink-0 h-8 bg-secondary" />

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'agents' && <AgentChat />}
            {activeTab === 'settings' && <Settings />}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
