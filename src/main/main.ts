import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPCChannels } from '../shared/ipc-channels';
import { PluginManager } from './plugins/PluginManager';
import { AgentManager } from './agent/AgentManager';
import { LLMProviderManager } from './llm/LLMProviderManager';
import { ExecutorService } from './services/ExecutorService';
import { ConfigManager } from './services/ConfigManager';
import { Logger } from './utils/Logger';
import { initializeDatabase, closeDatabase } from './database/connection';
import { runMigrations } from './database/schema';
import { migrateFromStore } from './database/migrate-from-store';

let mainWindow: BrowserWindow | null = null;
let pluginManager: PluginManager;
let agentManager: AgentManager;
let llmManager: LLMProviderManager;
let executorService: ExecutorService;
let configManager: ConfigManager;

// 开发环境检测：在 electron 开发模式下 NODE_ENV 可能未设置
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices(): Promise<void> {
  Logger.info('Initializing Ming services...');

  // 初始化配置管理器
  configManager = new ConfigManager();
  await configManager.initialize();

  // 初始化数据库
  initializeDatabase();
  runMigrations();
  migrateFromStore(configManager);

  // 初始化 LLM Provider 管理器
  llmManager = new LLMProviderManager(configManager);
  await llmManager.initialize();

  // 初始化执行服务（插件执行日报脚本依赖此项）
  executorService = new ExecutorService(configManager);
  await executorService.initialize();

  // 初始化插件管理器
  pluginManager = new PluginManager(configManager, executorService, llmManager);
  await pluginManager.initialize();

  // 初始化 Agent 管理器
  agentManager = new AgentManager(configManager, llmManager, pluginManager);
  await agentManager.initialize();

  Logger.info('All services initialized successfully');
}

function setupIPCHandlers(): void {
  // 插件相关
  ipcMain.handle(IPCChannels.PLUGIN_LIST, async () => {
    return pluginManager.listPlugins();
  });

  ipcMain.handle(IPCChannels.PLUGIN_EXECUTE, async (_, pluginId: string, params: any) => {
    return pluginManager.executePlugin(pluginId, params);
  });

  // Agent 相关
  ipcMain.handle(IPCChannels.AGENT_CREATE, async (_, config: any) => {
    return agentManager.createAgent(config);
  });

  ipcMain.handle(IPCChannels.AGENT_CHAT, async (_, agentId: string, message: string) => {
    return agentManager.chat(agentId, message);
  });

  ipcMain.handle(IPCChannels.AGENT_LIST, async () => {
    return agentManager.listAgents();
  });

  // Conversation 相关
  ipcMain.handle(IPCChannels.CONVERSATION_CREATE, async () => {
    return agentManager.createConversation();
  });

  ipcMain.handle(IPCChannels.CONVERSATION_LIST, async () => {
    return agentManager.listConversations();
  });

  ipcMain.handle(IPCChannels.CONVERSATION_MESSAGES, async (_, conversationId: string) => {
    return agentManager.getConversationMessages(conversationId);
  });

  ipcMain.handle(IPCChannels.CONVERSATION_DELETE, async (_, conversationId: string) => {
    return agentManager.deleteConversation(conversationId);
  });

  ipcMain.handle(IPCChannels.CONVERSATION_RENAME, async (_, conversationId: string, title: string) => {
    return agentManager.renameConversation(conversationId, title);
  });

  ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId: string, agentId: string, message: string, model?: string) => {
    const webContents = event.sender;
    agentManager.chatInConversationStream(conversationId, agentId, message, model, webContents);
  });

  // LLM Provider 相关
  ipcMain.handle(IPCChannels.LLM_LIST_PROVIDERS, async () => {
    return llmManager.listProviders();
  });

  ipcMain.handle(IPCChannels.LLM_CHAT, async (_, providerId: string, messages: any[]) => {
    return llmManager.chat(providerId, messages);
  });

  ipcMain.handle(IPCChannels.LLM_ADD_PROVIDER, async (_, config: any) => {
    return llmManager.addProvider(config);
  });

  ipcMain.handle(IPCChannels.LLM_REMOVE_PROVIDER, async (_, providerId: string) => {
    return llmManager.removeProvider(providerId);
  });

  ipcMain.handle(IPCChannels.LLM_UPDATE_PROVIDER, async (_, providerId: string, updates: any) => {
    return llmManager.updateProvider(providerId, updates);
  });

  ipcMain.handle(IPCChannels.LLM_FETCH_MODELS, async (_, providerId: string) => {
    return llmManager.fetchModels(providerId);
  });

  // 执行服务相关
  ipcMain.handle(IPCChannels.EXECUTE_COMMAND, async (_, command: string, options?: any) => {
    return executorService.executeCommand(command, options);
  });

  ipcMain.handle(IPCChannels.EXECUTE_SCRIPT, async (_, script: string, args?: any) => {
    return executorService.executeScript(script, args);
  });

  // 配置相关
  ipcMain.handle(IPCChannels.CONFIG_GET, async (_, key: string) => {
    return configManager.get(key);
  });

  ipcMain.handle(IPCChannels.CONFIG_SET, async (_, key: string, value: any) => {
    return configManager.set(key, value);
  });

  ipcMain.handle(IPCChannels.CONFIG_GET_ALL, async () => {
    return configManager.getAll();
  });

  // 对话框相关
  ipcMain.handle(IPCChannels.DIALOG_SHOW_OPEN_DIALOG, async (_, options: Electron.OpenDialogOptions) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, options);
  });

  // Git 仓库扫描
  ipcMain.handle(IPCChannels.GIT_SCAN_REPOS, async () => {
    const workPaths = configManager.get('workPaths', []) as string[];
    if (!workPaths.length) return [];

    const repos: { name: string; path: string }[] = [];

    function scanDir(dir: string, depth: number) {
      if (depth <= 0) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (!entry.isDirectory()) continue;
          if (fs.existsSync(path.join(fullPath, '.git'))) {
            repos.push({ name: entry.name, path: fullPath });
          } else if (depth > 1) {
            scanDir(fullPath, depth - 1);
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    // Also check if a workPath itself is a git repo
    for (const wp of workPaths) {
      try {
        if (fs.existsSync(path.join(wp, '.git'))) {
          repos.push({ name: path.basename(wp), path: wp });
        }
        scanDir(wp, 3);
      } catch { /* skip */ }
    }

    // Deduplicate by path
    const seen = new Set<string>();
    return repos.filter(r => {
      if (seen.has(r.path)) return false;
      seen.add(r.path);
      return true;
    });
  });

  Logger.info('IPC handlers registered');
}

app.whenReady().then(async () => {
  await initializeServices();
  setupIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 错误处理
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
