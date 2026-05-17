import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { format } from 'date-fns';
import { IPCChannels } from '../shared/ipc-channels';
import { AgentManager } from './agent/AgentManager';
import { SkillManager } from './skill/SkillManager';
import { LLMProviderManager } from './llm/LLMProviderManager';
import { ExecutorService } from './services/ExecutorService';
import { ConfigManager } from './services/ConfigManager';
import { PromptTemplateManager } from './services/PromptTemplateManager';
import { DebugLogService } from './services/DebugLogService';
import { ToolExecutor } from './tools/ToolExecutor';
import { ToolPersistenceManager } from './tools/ToolPersistenceManager';
import { createDailyReportTool } from './tools/dailyReportTool';
import { createReadFileTool } from './tools/readFileTool';
import { createListDirectoryTool } from './tools/listDirectoryTool';
import { createWriteFileTool } from './tools/writeFileTool';
import { createExecuteCommandTool } from './tools/executeCommandTool';
import { createSearchFilesTool } from './tools/searchFilesTool';
import { ToolApprovalManager } from './tools/toolApproval';
import { Logger } from './utils/Logger';
import { initializeDatabase, closeDatabase, getDatabase } from './database/connection';
import { runMigrations } from './database/schema';
import { migrateFromStore } from './database/migrate-from-store';
import { GitCacheManager } from './services/GitCacheManager';
import { scanBundles, type DetectedLibrary } from './techstack/bundleScanner';
import { ChatService } from './chat/ChatService';
import { MCPManager } from './mcp/MCPManager';
import type { DebugLogEntry, DebugModelCall } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let debugWindow: BrowserWindow | null = null;
let agentManager: AgentManager;
let chatService: ChatService;
let skillManager: SkillManager;
let llmManager: LLMProviderManager;
let toolExecutor: ToolExecutor;
let toolPersistenceManager: ToolPersistenceManager;
let executorService: ExecutorService;
let configManager: ConfigManager;
let promptTemplateManager: PromptTemplateManager;
const debugLogService = new DebugLogService();
let mcpManager: MCPManager;

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
    loadRendererWindow(mainWindow);
    mainWindow.webContents.openDevTools();
  } else {
    loadRendererWindow(mainWindow);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (toolExecutor) {
    toolExecutor.setMainWindow(mainWindow);
  }
}

function loadRendererWindow(window: BrowserWindow, view?: string): void {
  if (isDev) {
    const suffix = view ? `?view=${encodeURIComponent(view)}` : '';
    window.loadURL(`http://localhost:5174${suffix}`);
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: view ? { view } : undefined,
    });
  }
}

function createDebugWindow(): void {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.focus();
    return;
  }

  debugWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
    title: 'Ming Debug Panel',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
  });

  loadRendererWindow(debugWindow, 'debug');

  debugWindow.on('closed', () => {
    debugWindow = null;
  });
}

function broadcastDebugLog(entry: DebugLogEntry): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPCChannels.DEBUG_LOG_EVENT, entry);
    }
  }
}

function recordModelDebug(event: DebugModelCall, targetWebContents?: Electron.WebContents): void {
  const entry = debugLogService.addModelCall(event);
  if (targetWebContents && !targetWebContents.isDestroyed()) {
    targetWebContents.send(IPCChannels.DEBUG_MODEL_CALL, event);
  }
  broadcastDebugLog(entry);
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

  // 初始化执行服务（日报 tool 执行 Python 脚本依赖此项）
  executorService = new ExecutorService(configManager);
  await executorService.initialize();

  // 初始化 Tool Executor
  toolExecutor = new ToolExecutor();
  toolExecutor.register(createDailyReportTool(configManager, executorService));
  toolExecutor.register(createReadFileTool());
  toolExecutor.register(createListDirectoryTool());
  toolExecutor.register(createWriteFileTool());
  toolExecutor.register(createExecuteCommandTool(executorService));
  toolExecutor.register(createSearchFilesTool());

  const toolApprovalManager = new ToolApprovalManager();
  toolExecutor.setApprovalManager(toolApprovalManager);

  toolPersistenceManager = new ToolPersistenceManager(toolExecutor);

  // 初始化 Skill 管理器
  skillManager = new SkillManager();
  await skillManager.initialize();

  // 初始化 Prompt Template 管理器
  promptTemplateManager = new PromptTemplateManager();
  promptTemplateManager.initialize();

  // 初始化 Agent 管理器
  agentManager = new AgentManager(
    configManager,
    llmManager,
    toolExecutor,
    () => skillManager.listSkills().filter((skill) => skill.enabled),
    recordModelDebug
  );
  await agentManager.initialize();

  chatService = new ChatService(agentManager, skillManager, llmManager, toolExecutor, recordModelDebug);

  // 初始化 MCP 管理器
  mcpManager = new MCPManager();
  await mcpManager.initialize();

  // Sync MCP tools into ToolExecutor so they're available in chat
  syncMcpTools();

  Logger.info('All services initialized successfully');
}

function setupIPCHandlers(): void {
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

  ipcMain.handle(IPCChannels.AGENT_UPDATE, async (_, agentId: string, updates: any) => {
    return agentManager.updateAgent(agentId, updates);
  });

  ipcMain.handle(IPCChannels.AGENT_DELETE, async (_, agentId: string) => {
    return agentManager.deleteAgent(agentId);
  });

  // Skill 相关
  ipcMain.handle(IPCChannels.SKILL_CREATE, async (_, config: any) => {
    return skillManager.createSkill(config);
  });

  ipcMain.handle(IPCChannels.SKILL_LIST, async () => {
    return skillManager.listSkills();
  });

  ipcMain.handle(IPCChannels.SKILL_UPDATE, async (_, skillId: string, updates: any) => {
    return skillManager.updateSkill(skillId, updates);
  });

  ipcMain.handle(IPCChannels.SKILL_DELETE, async (_, skillId: string) => {
    await skillManager.deleteSkill(skillId);

    const agents = agentManager.listAgents();
    await Promise.all(
      agents
        .filter((agent) => agent.skills.includes(skillId))
        .map((agent) =>
          agentManager.updateAgent(agent.id, {
            skills: agent.skills.filter((id) => id !== skillId),
          })
        )
    );
  });

  ipcMain.handle(IPCChannels.SKILL_SYNC_LOCAL, async () => {
    return skillManager.syncLocalSkills();
  });

  // Prompt 相关
  ipcMain.handle(IPCChannels.PROMPT_CREATE, async (_, config: any) => {
    return promptTemplateManager.createPrompt(config);
  });

  ipcMain.handle(IPCChannels.PROMPT_LIST, async () => {
    return promptTemplateManager.listPrompts();
  });

  ipcMain.handle(IPCChannels.PROMPT_UPDATE, async (_, promptId: string, updates: any) => {
    return promptTemplateManager.updatePrompt(promptId, updates);
  });

  ipcMain.handle(IPCChannels.PROMPT_DELETE, async (_, promptId: string) => {
    return promptTemplateManager.deletePrompt(promptId);
  });

  ipcMain.handle(IPCChannels.PROMPT_TEST, async (_, renderedContent: string, model?: string) => {
    const providerId = llmManager.getDefaultProviderId();
    if (!providerId) {
      throw new Error('No LLM provider configured');
    }
    const messages = [{ role: 'user' as const, content: renderedContent }];
    const result = await llmManager.chat(providerId, messages, model);
    if (typeof result === 'string') {
      return result;
    }
    // If the response contains tool calls, stringify them for display
    return JSON.stringify(result);
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

  ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => {
    const webContents = event.sender;
    chatService.handleChat(conversationId, agentId || null, message, model, webContents, injectedSkills);
  });

  ipcMain.on(IPCChannels.CONVERSATION_CHAT_ABORT, (_, conversationId: string) => {
    chatService.abortChat(conversationId);
  });

  // Debug 相关
  ipcMain.handle(IPCChannels.DEBUG_OPEN_PANEL, async () => {
    createDebugWindow();
  });

  ipcMain.handle(IPCChannels.DEBUG_GET_LOGS, async () => {
    return debugLogService.list();
  });

  ipcMain.handle(IPCChannels.DEBUG_CLEAR_LOGS, async () => {
    debugLogService.clear();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.DEBUG_LOG_EVENT, { cleared: true });
      }
    }
  });

  ipcMain.on(IPCChannels.DEBUG_REPORT_UI_STALL, (_, report: import('../shared/types').UIStallReport) => {
    const entry = debugLogService.addUIStall(report);
    broadcastDebugLog(entry);
  });

  // LLM Provider 相关
  ipcMain.handle(IPCChannels.LLM_LIST_PROVIDERS, async () => {
    return llmManager.listProviders();
  });

  ipcMain.handle(IPCChannels.LLM_CHAT, async (_, providerId: string, messages: any[]) => {
    const provider = llmManager.listProviders().find((item) => item.id === providerId);
    const startedAt = Date.now();
    recordModelDebug({
      type: 'request',
      timestamp: startedAt,
      data: {
        provider: provider?.name,
        model: provider?.models[0],
        messages: messages.map((message: any) => ({ role: message.role, content: message.content })),
      },
    });

    try {
      const result = await llmManager.chat(providerId, messages);
      recordModelDebug({
        type: 'response',
        timestamp: Date.now(),
        data: {
          provider: provider?.name,
          model: provider?.models[0],
          content: typeof result === 'string' ? result.slice(0, 200) : `[Tool calls: ${result.toolCalls.map((tool) => tool.function.name).join(', ')}]`,
          duration: Date.now() - startedAt,
        },
      });
      return result;
    } catch (error) {
      recordModelDebug({
        type: 'error',
        timestamp: Date.now(),
        data: {
          provider: provider?.name,
          model: provider?.models[0],
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startedAt,
        },
      });
      throw error;
    }
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

  // Git user info
  ipcMain.handle(IPCChannels.GIT_GET_USER, () => {
    try {
      const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
      const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
      return { name, email };
    } catch {
      return { name: '', email: '' };
    }
  });

  // Get all git authors from configured work paths
  ipcMain.handle(IPCChannels.GIT_GET_ALL_AUTHORS, async () => {
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

    for (const wp of workPaths) {
      try {
        if (fs.existsSync(path.join(wp, '.git'))) {
          repos.push({ name: path.basename(wp), path: wp });
        }
        scanDir(wp, 3);
      } catch { /* skip */ }
    }

    // Collect all unique authors
    const authorSet = new Set<string>();
    for (const repo of repos) {
      try {
        const cmd = `git -C "${repo.path}" log --all --format='%aN|%aE'`;
        const output = await execAsync(cmd);
        const lines = output.trim().split('\n');
        for (const line of lines) {
          if (line.includes('|')) {
            authorSet.add(line.trim());
          }
        }
      } catch { /* skip repos with errors */ }
      
      // Yield to event loop every 5 repos
      if (repos.indexOf(repo) % 5 === 4) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Convert to array of { name, email } and sort by name
    const authors = Array.from(authorSet)
      .map(authorStr => {
        const [name, email] = authorStr.split('|');
        return { name: name.trim(), email: email.trim() };
      })
      .filter(a => a.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return authors;
  });

  // Git commit heatmap data
  ipcMain.handle(IPCChannels.GIT_HEATMAP, async (_event, authors?: string[]) => {
    // Try to load from persistent cache first (only if no specific author filter)
    if (!authors || authors.length === 0) {
      const cachedHeatmap = GitCacheManager.loadHeatmapCache();
      if (cachedHeatmap) {
        return {
          data: cachedHeatmap.data,
          stats: cachedHeatmap.stats,
        };
      }
    }

    const workPaths = configManager.get('workPaths', []) as string[];
    if (!workPaths.length) return { data: {}, stats: { totalCommits: 0, longestStreak: 0, currentStreak: 0, mostActiveMonth: '', mostActiveDay: '' } };

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
      } catch { /* skip */ }
    }

    for (const wp of workPaths) {
      try {
        if (fs.existsSync(path.join(wp, '.git'))) {
          repos.push({ name: path.basename(wp), path: wp });
        }
        scanDir(wp, 3);
      } catch { /* skip */ }
    }

    const data: Record<string, number> = {};
    // Build author flags for git log (multiple --author flags = OR logic)
    let authorFlags = '';
    if (authors && authors.length > 0) {
      authorFlags = authors.map(a => `--author="${a}"`).join(' ');
    } else {
      // Fallback: try git config user.name
      try {
        const name = await execAsync('git config user.name');
        const trimmed = name.trim();
        if (trimmed) {
          authorFlags = `--author="${trimmed}"`;
        }
      } catch { /* no git user configured */ }
    }

    // Process repos sequentially with small delays to avoid blocking UI
    for (const repo of repos) {
      try {
        const cmd = authorFlags
          ? `git -C "${repo.path}" log --all ${authorFlags} --since="1 year ago" --format=%ad --date=short`
          : `git -C "${repo.path}" log --all --since="1 year ago" --format=%ad --date=short`;
        const output = await execAsync(cmd);
        for (const line of output.trim().split('\n')) {
          const date = line.trim();
          if (date) data[date] = (data[date] || 0) + 1;
        }
      } catch { /* skip repos with no commits or errors */ }
      
      // Yield to event loop every 5 repos to prevent UI blocking
      if (repos.indexOf(repo) % 5 === 4) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Compute stats
    const totalCommits = Object.values(data).reduce((a, b) => a + b, 0);
    const dates = Object.keys(data).sort();

    // Longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    for (const d of dates) {
      const cur = new Date(d);
      if (prevDate) {
        const diffDays = Math.round((cur.getTime() - prevDate.getTime()) / 86400000);
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = cur;
    }

    // Current streak (from today backwards)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streakDate = new Date(today);
    let currentStreak = 0;
    while (true) {
      const key = format(streakDate, 'yyyy-MM-dd');
      if (data[key] && data[key] > 0) {
        currentStreak++;
        streakDate.setDate(streakDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Most active month
    const monthCounts: Record<string, number> = {};
    for (const [d, count] of Object.entries(data)) {
      const monthKey = d.slice(0, 7);
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + count;
    }
    const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    // Most active day
    const mostActiveDay = dates.reduce((max, d) => (data[d] > (data[max] || 0) ? d : max), dates[0] || '');

    const heatmapData = {
      data,
      stats: { totalCommits, longestStreak, currentStreak, mostActiveMonth, mostActiveDay },
    };

    // Save to persistent cache (only if no specific author filter)
    if (!authors || authors.length === 0) {
      GitCacheManager.saveHeatmapCache(heatmapData);
    }

    return heatmapData;
  });

  // Clear git cache
  ipcMain.handle(IPCChannels.GIT_CLEAR_CACHE, async () => {
    GitCacheManager.clearAllCache();
    return { success: true };
  });

  // Get user's selected identities
  ipcMain.handle(IPCChannels.GIT_GET_MY_IDENTITIES, () => {
    const db = getDatabase();
    const rows = db.prepare('SELECT name, email FROM user_identities').all() as { name: string; email: string }[];
    return rows;
  });

  // Set user's selected identities (replaces all)
  ipcMain.handle(IPCChannels.GIT_SET_MY_IDENTITIES, (_, identities: { name: string; email: string }[]) => {
    const db = getDatabase();
    const insert = db.prepare('INSERT OR IGNORE INTO user_identities (name, email) VALUES (?, ?)');
    db.transaction(() => {
      db.exec('DELETE FROM user_identities');
      for (const id of identities) {
        insert.run(id.name, id.email);
      }
    })();
  });

  // Daily Report - 调用 daily-report tool 收集 Git 提交数据
  ipcMain.handle(IPCChannels.DAILY_REPORT_FETCH, async (_, params: any) => {
    const cacheKey = JSON.stringify(params || {});
    
    // Try to load from persistent cache first
    const cachedCommits = GitCacheManager.loadCommitsCache(cacheKey);
    if (cachedCommits) {
      return {
        commits: cachedCommits.commits,
        stats: cachedCommits.stats,
      };
    }

    const result = await toolExecutor.executeByName('daily-report', params || {});
    const data = JSON.parse(result); // tool 返回 JSON 字符串，解析成对象
    
    // Save to persistent cache
    GitCacheManager.saveCommitsCache(cacheKey, data.commits || [], {
      totalCommits: data.commits?.length || 0,
      totalRepos: new Set(data.commits?.map((c: any) => c.repo) || []).size,
    });
    
    return data;
  });

  // Daily Report - 保存日报记录
  ipcMain.handle(IPCChannels.DAILY_REPORT_SAVE, async (_, report: { title: string; content: string; timeRange: string; commitsCount: number; reposCount: number }) => {
    const db = getDatabase();
    const stmt = db.prepare(
      'INSERT INTO daily_reports (title, content, time_range, commits_count, repos_count) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(report.title, report.content, report.timeRange, report.commitsCount, report.reposCount);
    return { id: result.lastInsertRowid };
  });

  // Daily Report - 获取日报列表
  ipcMain.handle(IPCChannels.DAILY_REPORT_LIST, async () => {
    const db = getDatabase();
    const reports = db.prepare('SELECT * FROM daily_reports ORDER BY created_at DESC').all();
    return reports;
  });

  // Daily Report - 删除日报
  ipcMain.handle(IPCChannels.DAILY_REPORT_DELETE, async (_, id: number) => {
    const db = getDatabase();
    db.prepare('DELETE FROM daily_reports WHERE id = ?').run(id);
    return { success: true };
  });

  // Tool 相关
  ipcMain.handle(IPCChannels.TOOL_LIST, async () => {
    return toolPersistenceManager.list();
  });

  ipcMain.handle(IPCChannels.TOOL_GET, async (_, toolId: string) => {
    return toolPersistenceManager.get(toolId);
  });

  ipcMain.handle(IPCChannels.TOOL_CREATE, async (_, config: any) => {
    return toolPersistenceManager.create(config);
  });

  ipcMain.handle(IPCChannels.TOOL_UPDATE, async (_, toolId: string, updates: any) => {
    return toolPersistenceManager.update(toolId, updates);
  });

  ipcMain.handle(IPCChannels.TOOL_DELETE, async (_, toolId: string) => {
    return toolPersistenceManager.delete(toolId);
  });

  ipcMain.handle(IPCChannels.TOOL_EXECUTE, async (_, toolId: string, params: any) => {
    return toolPersistenceManager.execute(toolId, params);
  });

  // TechStack - 分析 DMG/App 安装包
  ipcMain.handle(IPCChannels.ANALYZE_APP, async (_, filePath: string) => {
    return analyzeAppBundle(filePath);
  });

  // TechStack - 分析项目文件夹
  ipcMain.handle(IPCChannels.ANALYZE_PROJECT, async (_, dirPath: string) => {
    return analyzeProjectDir(dirPath);
  });

  // MCP Server 相关
  ipcMain.handle(IPCChannels.MCP_SERVER_LIST, async () => {
    return mcpManager.listServers();
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_GET, async (_, serverId: string) => {
    return mcpManager.getServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_CREATE, async (_, config: any) => {
    return mcpManager.createServer(config);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_UPDATE, async (_, serverId: string, updates: any) => {
    return mcpManager.updateServer(serverId, updates);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_DELETE, async (_, serverId: string) => {
    return mcpManager.deleteServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_CONNECT, async (_, serverId: string) => {
    return mcpManager.connectServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_DISCONNECT, async (_, serverId: string) => {
    return mcpManager.disconnectServer(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_REFRESH_TOOLS, async (_, serverId: string) => {
    return mcpManager.refreshTools(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_SERVER_CALL_TOOL, async (_, serverId: string, toolName: string, args: any) => {
    return mcpManager.callTool(serverId, toolName, args);
  });

  // MCP server status events (broadcast to all windows)
  mcpManager.on('server-status', (data) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.MCP_SERVER_STATUS_EVENT, data);
      }
    }
  });

  mcpManager.on('server-tools', (data) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.MCP_SERVER_TOOLS_EVENT, data);
      }
    }
  });

  // MCP Debug 相关
  ipcMain.handle(IPCChannels.MCP_DEBUG_LOGS, async (_, serverId?: string) => {
    return mcpManager.getProtocolLogs(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_DEBUG_CLEAR, async (_, serverId?: string) => {
    return mcpManager.clearProtocolLogs(serverId);
  });

  ipcMain.handle(IPCChannels.MCP_DEBUG_EXPORT, async (_, serverId?: string) => {
    const logs = mcpManager.getProtocolLogs(serverId, 10000);
    return JSON.stringify(logs, null, 2);
  });

  // MCP protocol log events (broadcast to all windows)
  mcpManager.on('protocol-log', (entry) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.MCP_DEBUG_LOG_EVENT, entry);
      }
    }
  });

  // Keep MCP tools synced into ToolExecutor for chat integration
  mcpManager.on('server-tools', () => syncMcpTools());
  mcpManager.on('server-deleted', () => syncMcpTools());
  mcpManager.on('server-status', () => syncMcpTools());

  Logger.info('IPC handlers registered');
}

// ─── MCP Tool Sync ───────────────────────────────────────────────────

function syncMcpTools(): void {
  if (!mcpManager || !toolExecutor) return;

  // Remove all existing MCP tools
  toolExecutor.clearMcpTools();

  // Re-register tools from all connected servers
  const servers = mcpManager.listServers();
  for (const server of servers) {
    if (server.status !== 'connected') continue;

    const tools = mcpManager.listTools(server.id);
    const serverSlug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    for (const tool of tools) {
      const mcpToolName = `mcp__${serverSlug}__${tool.name}`;

      let schema = {};
      try { schema = tool.input_schema ? JSON.parse(tool.input_schema) : {}; } catch {}

      toolExecutor.registerMcpTool(
        mcpToolName,
        {
          type: 'function',
          function: {
            name: mcpToolName,
            description: `[MCP:${server.name}] ${tool.description || tool.name}`,
            parameters: schema.type ? schema : { type: 'object', properties: {} },
          },
        },
        async (params) => {
          const result = await mcpManager.callTool(server.id, tool.name, params);
          return typeof result === 'string' ? result : JSON.stringify(result);
        },
      );
    }
  }

  Logger.info(`MCP tools synced: ${servers.filter(s => s.status === 'connected').length} servers`);
}

// ─── TechStack Analysis Functions ─────────────────────────────────────

interface FrameworkDetection {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  version?: string;
  evidence: string[];
}

interface AppAnalysisResult {
  appName: string;
  version?: string;
  bundleId?: string;
  frameworks: FrameworkDetection[];
  resources: { type: string; count: number };
  fileType: string;
  categorizedDependencies?: Record<string, string[]>;
  detectedLibraries?: DetectedLibrary[];
  plistInfo?: Record<string, any>;
  runtimeProcesses?: string[];
}

interface ProjectAnalysisResult {
  languages: { name: string; percentage: number }[];
  frameworks: string[];
  buildTools: string[];
  packageManagers: string[];
  dependencies: { manager: string; count: number };
  categorizedDependencies: Record<string, string[]>;
}

function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf-8', timeout: 30000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

// Git-specific async exec with shorter timeout
function execGitAsync(cmd: string, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

async function analyzeAppBundle(filePath: string): Promise<AppAnalysisResult> {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath, ext);
  const result: AppAnalysisResult = {
    appName: basename,
    frameworks: [],
    resources: { type: '', count: 0 },
    fileType: ext,
  };

  let appPath = filePath;

  // DMG: mount, find .app, analyze, unmount
  if (ext === '.dmg') {
    try {
      const mountOutput = await execAsync(`hdiutil attach "${filePath}" -nobrowse -noverify -quiet 2>&1`);
      const mountPoint = mountOutput.split('\t').pop()?.trim();
      if (!mountPoint) throw new Error('Failed to mount DMG');

      // Find .app inside mounted volume
      const entries = fs.readdirSync(mountPoint);
      const appEntry = entries.find(e => e.endsWith('.app'));
      if (appEntry) {
        appPath = path.join(mountPoint, appEntry);
        await analyzeMacApp(appPath, result);
      }

      await execAsync(`hdiutil detach "${mountPoint}" -quiet`);
    } catch (err: any) {
      result.frameworks.push({ name: '分析失败', confidence: 'low', evidence: [err.message] });
    }
    return result;
  }

  // .app bundle
  if (ext === '.app' || fs.existsSync(path.join(filePath, 'Contents'))) {
    await analyzeMacApp(appPath, result);
  } else {
    result.frameworks.push({ name: 'Unsupported format', confidence: 'low', evidence: [`File extension: ${ext}`] });
  }

  return result;
}

async function analyzeMacApp(appPath: string, result: AppAnalysisResult) {
  const contents = path.join(appPath, 'Contents');
  if (!fs.existsSync(contents)) return;

  const categorizedDeps: Record<string, Set<string>> = {};

  // Read Info.plist via plutil (handles binary & XML plist formats)
  const plistPath = path.join(contents, 'Info.plist');
  const plistInfo: Record<string, any> = {};
  if (fs.existsSync(plistPath)) {
    try {
      const plistJson = await execAsync(`plutil -convert json -o - "${plistPath}"`);
      const plist = JSON.parse(plistJson);

      if (plist.CFBundleName) result.appName = plist.CFBundleName;
      if (plist.CFBundleDisplayName) plistInfo.displayName = plist.CFBundleDisplayName;
      if (plist.CFBundleShortVersionString) result.version = plist.CFBundleShortVersionString;
      if (plist.CFBundleIdentifier) result.bundleId = plist.CFBundleIdentifier;
      if (plist.LSMinimumSystemVersion) plistInfo.minOSVersion = plist.LSMinimumSystemVersion;
      if (plist.LSApplicationCategoryType) plistInfo.category = (plist.LSApplicationCategoryType as string).replace('public.app-category.', '');
      if (plist.NSPrincipalClass) plistInfo.principalClass = plist.NSPrincipalClass;

      if (plist.ElectronAsarIntegrity) plistInfo.electronAsarIntegrity = true;
      if (plist.NSPrincipalClass === 'AtomApplication') plistInfo.atomBased = true;
    } catch { /* skip */ }
  }
  result.plistInfo = plistInfo;

  const frameworksDir = path.join(contents, 'Frameworks');
  const resourcesDir = path.join(contents, 'Resources');

  // Detect frameworks
  const detections: FrameworkDetection[] = [];

  // Electron
  if (fs.existsSync(path.join(frameworksDir, 'Electron Framework.framework')) ||
      fs.existsSync(path.join(resourcesDir, 'app.asar')) ||
      fs.existsSync(path.join(resourcesDir, 'app.asar.unpacked'))) {
    const evidence: string[] = [];
    if (fs.existsSync(path.join(frameworksDir, 'Electron Framework.framework'))) evidence.push('Electron Framework.framework');
    if (fs.existsSync(path.join(resourcesDir, 'app.asar'))) evidence.push('app.asar');
    // Try to detect Electron version
    let version: string | undefined;
    try {
      const electronFramework = path.join(frameworksDir, 'Electron Framework.framework', 'Versions', 'A', 'Resources', 'version');
      if (fs.existsSync(electronFramework)) {
        version = fs.readFileSync(electronFramework, 'utf-8').trim();
      }
    } catch { /* skip */ }
    detections.push({ name: 'Electron', confidence: 'high', version, evidence });
  }

  // Tauri
  if (fs.existsSync(path.join(frameworksDir, 'WebView2.framework')) ||
      fs.existsSync(path.join(resourcesDir, '_updater'))) {
    detections.push({ name: 'Tauri', confidence: 'high', evidence: ['WebView2 or _updater detected'] });
  }

  // Flutter
  if (fs.existsSync(path.join(frameworksDir, 'App.framework', 'Flutter')) ||
      fs.existsSync(path.join(contents, 'Frameworks', 'FlutterMacOS.framework'))) {
    detections.push({ name: 'Flutter', confidence: 'high', evidence: ['Flutter framework detected'] });
  }

  // React Native (macOS)
  const jsbundleFiles = fs.existsSync(resourcesDir)
    ? fs.readdirSync(resourcesDir).filter(f => f.endsWith('.jsbundle') || f.endsWith('.bundle'))
    : [];
  if (jsbundleFiles.length > 0) {
    // Could be RN or just a JS bundle - check for React Native specifics
    detections.push({ name: 'React Native', confidence: 'medium', evidence: jsbundleFiles.slice(0, 3) });
  }

  // Qt
  if (fs.existsSync(path.join(frameworksDir, 'QtCore.framework')) ||
      fs.existsSync(path.join(frameworksDir, 'QtGui.framework'))) {
    detections.push({ name: 'Qt', confidence: 'high', evidence: ['QtCore/QtGui framework detected'] });
  }

  // Java/JVM
  if (fs.existsSync(path.join(frameworksDir, 'java')) ||
      fs.existsSync(path.join(contents, 'Java'))) {
    detections.push({ name: 'Java', confidence: 'high', evidence: ['Java runtime detected'] });
  }

  // Unity
  if (fs.existsSync(path.join(frameworksDir, 'UnityPlayer.framework')) ||
      fs.existsSync(path.join(resourcesDir, 'Data', 'Managed'))) {
    detections.push({ name: 'Unity', confidence: 'high', evidence: ['Unity engine detected'] });
  }

  // Detect native macOS frameworks
  const nativeFrameworks = ['Mantle.framework', 'ReactiveObjC.framework', 'Squirrel.framework', 'Cocoa.framework', 'SwiftUI.framework'];
  for (const fw of nativeFrameworks) {
    if (fs.existsSync(path.join(frameworksDir, fw))) {
      const fwName = fw.replace('.framework', '');
      if (!detections.find(d => d.name === fwName)) {
        detections.push({ name: fwName, confidence: 'medium', evidence: [`${fw} detected`] });
      }
    }
  }

  // If no specific framework found, it's likely native (SwiftUI/AppKit)
  if (detections.length === 0) {
    detections.push({ name: 'Native (AppKit/SwiftUI)', confidence: 'medium', evidence: ['No cross-platform framework detected'] });
  }

  result.frameworks = detections;

  // Count resources
  if (fs.existsSync(resourcesDir)) {
    try {
      const resourceFiles = fs.readdirSync(resourcesDir, { recursive: true }) as string[];
      const jsFiles = resourceFiles.filter(f => f.endsWith('.js') || f.endsWith('.mjs')).length;
      const htmlFiles = resourceFiles.filter(f => f.endsWith('.html')).length;
      const imgFiles = resourceFiles.filter(f => /\.(png|jpg|jpeg|svg|gif|icns)$/.test(f.toString())).length;
      result.resources = { type: `${jsFiles} JS, ${htmlFiles} HTML, ${imgFiles} images`, count: resourceFiles.length };
    } catch { /* skip */ }
  }

  // Bundle fingerprint scanning (Electron/Tauri apps)
  const asarPath = path.join(resourcesDir, 'app.asar');
  const isAsar = fs.existsSync(asarPath);
  const scanTarget = isAsar ? asarPath : resourcesDir;

  // Check if there are JS/CSS files worth scanning
  const hasWebAssets = isAsar || (
    fs.existsSync(resourcesDir) && (
      fs.readdirSync(resourcesDir).some(f => f.endsWith('.js') || f.endsWith('.html'))
    )
  );

  if (hasWebAssets) {
    try {
      const libs = scanBundles(scanTarget, isAsar);
      result.detectedLibraries = libs;

      // Also scan unpacked node_modules for native modules
      const unpackedNm = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
      if (fs.existsSync(unpackedNm)) {
        const modules = fs.readdirSync(unpackedNm).filter(d => !d.startsWith('.'));
        for (const mod of modules) {
          libs.push({
            name: mod,
            category: '原生模块',
            confidence: 'high',
            evidence: [`app.asar.unpacked/node_modules/${mod}`],
            source: 'node_modules',
          });
        }
      }

      // Build categorizedDependencies from detectedLibraries
      const catMap: Record<string, Set<string>> = {};
      for (const lib of libs) {
        if (!catMap[lib.category]) catMap[lib.category] = new Set();
        catMap[lib.category].add(lib.name);
      }
      result.categorizedDependencies = Object.fromEntries(
        Object.entries(catMap).map(([k, v]) => [k, Array.from(v)])
      );
    } catch { /* skip bundle analysis */ }
  } else {
    // No web assets — convert any existing categorizedDeps
    result.categorizedDependencies = Object.fromEntries(
      Object.entries(categorizedDeps).map(([k, v]) => [k, Array.from(v)])
    );
  }

  // Check for running processes (if app is currently running)
  try {
    const bundleId = result.bundleId;
    if (bundleId) {
      const psOutput = execSync(`ps aux | grep -i "${bundleId}" | grep -v grep | head -5`, { encoding: 'utf-8', timeout: 3000 });
      if (psOutput.trim()) {
        result.runtimeProcesses = psOutput.trim().split('\n').map(line => {
          const parts = line.split(/\s+/);
          return parts.slice(10).join(' ');
        });
      }
    }
  } catch { /* skip process check */ }
}

async function analyzeProjectDir(dirPath: string): Promise<ProjectAnalysisResult> {
  const result: ProjectAnalysisResult = {
    languages: [],
    frameworks: [],
    buildTools: [],
    packageManagers: [],
    dependencies: { manager: '', count: 0 },
    categorizedDependencies: {},
  };

  // Detect languages by file extension count
  const extCounts: Record<string, number> = {};
  const maxDepth = 4;
  const maxFiles = 5000;
  const excludeDirs = new Set([
    'node_modules', 'vendor', '__pycache__', '.git',
    'target', 'build', 'dist', 'out', 'bin',
    '.next', '.nuxt', '.output', '.cache', '.turbo',
    'Pods', 'DerivedData', 'coverage', '.gradle', '.idea',
  ]);

  function countFiles(dir: string, depth: number, total: number): number {
    if (depth <= 0 || total >= maxFiles) return total;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (total >= maxFiles) break;
        if (entry.name.startsWith('.') || excludeDirs.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total = countFiles(fullPath, depth - 1, total);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) extCounts[ext] = (extCounts[ext] || 0) + 1;
          total++;
        }
      }
    } catch { /* skip */ }
    return total;
  }

  countFiles(dirPath, maxDepth, 0);

  // Map extensions to languages
  const extToLang: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript',
    '.py': 'Python', '.pyi': 'Python',
    '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
    '.c': 'C', '.h': 'C', '.cpp': 'C++', '.hpp': 'C++', '.cc': 'C++',
    '.cs': 'C#', '.rb': 'Ruby', '.php': 'PHP', '.vue': 'Vue', '.svelte': 'Svelte',
    '.css': 'CSS', '.scss': 'CSS', '.less': 'CSS', '.html': 'HTML', '.xml': 'XML',
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
    '.sh': 'Shell', '.bash': 'Shell', '.sql': 'SQL',
    '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang',
    '.scala': 'Scala', '.lua': 'Lua', '.r': 'R',
  };

  const langCounts: Record<string, number> = {};
  for (const [ext, count] of Object.entries(extCounts)) {
    const lang = extToLang[ext];
    if (lang) langCounts[lang] = (langCounts[lang] || 0) + count;
  }

  const totalLangFiles = Object.values(langCounts).reduce((a, b) => a + b, 0) || 1;
  result.languages = Object.entries(langCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, percentage: Math.round(count / totalLangFiles * 100) }));

  // Detect frameworks from config files
  const frameworks = new Set<string>();
  const buildTools = new Set<string>();
  const packageManagers = new Set<string>();
  let depCount = 0;
  let depManager = '';
  const categorizedDeps: Record<string, Set<string>> = {};

  // Dependency categorization helper
  function categorizeDeps(deps: Record<string, any>) {
    const categories: Record<string, string[]> = {
      'UI 框架': ['react', 'react-dom', 'vue', '@angular/core', 'svelte', 'solid-js', 'preact'],
      'UI 组件库': ['@mui/material', '@chakra-ui/react', 'antd', '@radix-ui', 'shadcn', 'daisyui', 'element-plus', 'vant', 'vuetify', 'quasar'],
      '状态管理': ['zustand', 'redux', '@reduxjs/toolkit', 'mobx', 'recoil', 'jotai', 'pinia', 'vuex'],
      '路由': ['react-router-dom', '@tanstack/router', 'vue-router', 'next', 'nuxt', 'remix', 'gatsby'],
      'HTTP 客户端': ['axios', 'got', 'node-fetch', 'ky', 'superagent', 'undici'],
      '数据库 ORM': ['prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'knex', 'redis', 'ioredis'],
      '样式方案': ['tailwindcss', 'styled-components', '@emotion', 'sass', 'less', 'postcss', 'css-modules'],
      '测试工具': ['jest', 'vitest', 'mocha', 'cypress', 'playwright', '@testing-library', 'sinon', 'chai', 'supertest'],
      '构建工具': ['webpack', 'vite', 'esbuild', 'rollup', '@babel/core', 'swc', 'parcel', 'turbopack'],
      '代码质量': ['eslint', 'prettier', 'stylelint', 'husky', 'lint-staged', 'commitlint'],
      '类型检查': ['typescript', 'zod', 'joi', 'yup', 'class-validator', 'io-ts', 'ajv'],
      '日期处理': ['dayjs', 'moment', 'date-fns', 'luxon', 'temporal'],
      '国际化': ['i18next', 'vue-i18n', 'react-intl', '@formatjs', 'next-intl'],
      '图表可视化': ['echarts', 'chart.js', 'd3', 'recharts', '@visx', 'antv', 'plotly'],
      '动画库': ['framer-motion', 'gsap', 'lottie', 'animejs', '@react-spring'],
      '文件处理': ['multer', 'sharp', 'pdf-lib', 'xlsx', 'file-saver', 'jszip'],
      '日志工具': ['winston', 'pino', 'bunyan', 'log4js', 'debug'],
      '认证授权': ['jsonwebtoken', 'passport', 'bcrypt', 'oauth', 'next-auth', '@clerk'],
      'WebSocket': ['socket.io', 'ws', 'graphql-ws', 'ably', 'pusher'],
      '桌面开发': ['electron', '@tauri-apps/api', '@tauri-apps/cli'],
      '移动开发': ['react-native', '@react-native', 'expo', 'capacitor', 'ionic'],
    };

    for (const [depName, _version] of Object.entries(deps)) {
      for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(k => depName === k || depName.startsWith(k + '/') || depName.startsWith('@' + k.split('/')[0]?.replace('@', '') + '/'))) {
          if (!categorizedDeps[category]) categorizedDeps[category] = new Set();
          categorizedDeps[category].add(depName);
        }
      }
    }
  }

  // package.json
  const pkgPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      depCount = Object.keys(allDeps).length;
      depManager = 'npm';

      // Categorize dependencies
      categorizeDeps(allDeps);

      // Detect frameworks
      if (allDeps['react'] || allDeps['react-dom']) frameworks.add('React');
      if (allDeps['vue']) frameworks.add('Vue');
      if (allDeps['@angular/core']) frameworks.add('Angular');
      if (allDeps['svelte']) frameworks.add('Svelte');
      if (allDeps['next']) frameworks.add('Next.js');
      if (allDeps['nuxt']) frameworks.add('Nuxt');
      if (allDeps['@remix-run/react']) frameworks.add('Remix');
      if (allDeps['gatsby']) frameworks.add('Gatsby');
      if (allDeps['express']) frameworks.add('Express');
      if (allDeps['fastify']) frameworks.add('Fastify');
      if (allDeps['nestjs'] || allDeps['@nestjs/core']) frameworks.add('NestJS');
      if (allDeps['electron']) frameworks.add('Electron');
      if (allDeps['@tauri-apps/api']) frameworks.add('Tauri');
      if (allDeps['three']) frameworks.add('Three.js');
      if (allDeps['d3']) frameworks.add('D3.js');
      if (allDeps['tailwindcss']) buildTools.add('Tailwind CSS');
      if (allDeps['webpack']) buildTools.add('Webpack');
      if (allDeps['vite']) buildTools.add('Vite');
      if (allDeps['esbuild']) buildTools.add('esbuild');
      if (allDeps['rollup']) buildTools.add('Rollup');
      if (allDeps['@babel/core']) buildTools.add('Babel');
      if (allDeps['typescript'] || allDeps['ts-node']) buildTools.add('TypeScript');
      if (allDeps['eslint']) buildTools.add('ESLint');
      if (allDeps['prettier']) buildTools.add('Prettier');
      if (allDeps['jest']) buildTools.add('Jest');
      if (allDeps['vitest']) buildTools.add('Vitest');
    } catch { /* skip */ }

    if (fs.existsSync(path.join(dirPath, 'pnpm-lock.yaml'))) { packageManagers.add('pnpm'); depManager = 'pnpm'; }
    if (fs.existsSync(path.join(dirPath, 'yarn.lock'))) { packageManagers.add('yarn'); depManager = 'yarn'; }
    if (fs.existsSync(path.join(dirPath, 'bun.lockb'))) { packageManagers.add('bun'); depManager = 'bun'; }
    if (!packageManagers.size) packageManagers.add('npm');
  }

  // Cargo.toml
  const cargoPath = path.join(dirPath, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    frameworks.add('Rust');
    packageManagers.add('Cargo');
    try {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      const depMatches = content.match(/^\[dependencies\]$/m);
      if (depMatches) {
        const depSection = content.split(/^\[dependencies\]$/m)[1]?.split(/^\[/m)[0] || '';
        const depLines = depSection.split('\n').filter(l => l.includes('='));
        depCount += depLines.length;
        depManager = depManager || 'Cargo';
        if (content.includes('actix')) frameworks.add('Actix');
        if (content.includes('axum')) frameworks.add('Axum');
        if (content.includes('tokio')) frameworks.add('Tokio');
        if (content.includes('serde')) buildTools.add('Serde');
        if (content.includes('clap')) buildTools.add('Clap');
      }
    } catch { /* skip */ }
  }

  // pyproject.toml / requirements.txt
  if (fs.existsSync(path.join(dirPath, 'pyproject.toml'))) {
    frameworks.add('Python');
    packageManagers.add('pip');
    try {
      const content = fs.readFileSync(path.join(dirPath, 'pyproject.toml'), 'utf-8');
      if (content.includes('django')) frameworks.add('Django');
      if (content.includes('flask')) frameworks.add('Flask');
      if (content.includes('fastapi')) frameworks.add('FastAPI');
    } catch { /* skip */ }
  } else if (fs.existsSync(path.join(dirPath, 'requirements.txt'))) {
    frameworks.add('Python');
    packageManagers.add('pip');
  }

  // go.mod
  if (fs.existsSync(path.join(dirPath, 'go.mod'))) {
    frameworks.add('Go');
    packageManagers.add('Go Modules');
    try {
      const content = fs.readFileSync(path.join(dirPath, 'go.mod'), 'utf-8');
      const requireLines = content.split('\n').filter(l => l.startsWith('\t'));
      depCount += requireLines.length;
      depManager = depManager || 'Go Modules';
      if (content.includes('gin-gonic')) frameworks.add('Gin');
      if (content.includes('echo')) frameworks.add('Echo');
      if (content.includes('fiber')) frameworks.add('Fiber');
    } catch { /* skip */ }
  }

  // pom.xml / build.gradle
  if (fs.existsSync(path.join(dirPath, 'pom.xml')) || fs.existsSync(path.join(dirPath, 'build.gradle')) || fs.existsSync(path.join(dirPath, 'build.gradle.kts'))) {
    frameworks.add('Java/Kotlin');
    if (fs.existsSync(path.join(dirPath, 'pom.xml'))) { packageManagers.add('Maven'); depManager = depManager || 'Maven'; }
    else { packageManagers.add('Gradle'); depManager = depManager || 'Gradle'; }
  }

  // .csproj / .sln
  const csFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.csproj') || f.endsWith('.sln'));
  if (csFiles.length > 0) {
    frameworks.add('.NET');
    packageManagers.add('NuGet');
  }

  // Gemfile
  if (fs.existsSync(path.join(dirPath, 'Gemfile'))) {
    frameworks.add('Ruby');
    packageManagers.add('Bundler');
  }

  // Docker
  if (fs.existsSync(path.join(dirPath, 'Dockerfile'))) {
    buildTools.add('Docker');
  }

  result.frameworks = Array.from(frameworks);
  result.buildTools = Array.from(buildTools);
  result.packageManagers = Array.from(packageManagers);
  result.dependencies = { manager: depManager, count: depCount };
  result.categorizedDependencies = Object.fromEntries(
    Object.entries(categorizedDeps).map(([k, v]) => [k, Array.from(v)])
  );

  return result;
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

app.on('window-all-closed', async () => {
  if (mcpManager) await mcpManager.shutdown();
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
