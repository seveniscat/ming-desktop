import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Plugin, PluginExecutionResult, PluginConfig, ChatMessage } from '../../shared/types';
import { DEFAULT_DAILY_REPORT_TEMPLATE, DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT } from '../../shared/dailyReportDefaults';
import { Logger } from '../utils/Logger';
import { ExecutorService } from '../services/ExecutorService';
import { ConfigManager } from '../services/ConfigManager';
import { LLMProviderManager } from '../llm/LLMProviderManager';

export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDir: string;
  private loadedPlugins: Map<string, any> = new Map();

  constructor(
    private configManager: ConfigManager,
    private executorService?: ExecutorService,
    private llmManager?: LLMProviderManager
  ) {
    super();
    this.pluginDir = path.join(process.env.HOME || '', '.hermes-desktop', 'plugins');
  }

  async initialize(): Promise<void> {
    Logger.info('Initializing Plugin Manager...');

    // 创建插件目录
    try {
      await fs.mkdir(this.pluginDir, { recursive: true });
    } catch (error) {
      Logger.error('Failed to create plugin directory:', error);
    }

    // 加载内置插件
    await this.loadBuiltInPlugins();

    // 加载用户插件
    await this.loadUserPlugins();

    Logger.info(`Loaded ${this.plugins.size} plugins`);
  }

  private async loadBuiltInPlugins(): Promise<void> {
    // 定义内置插件
    const builtInPlugins: Plugin[] = [
      {
        id: 'daily-report',
        name: 'Daily Report Generator',
        version: '1.0.0',
        description: 'Generate daily work reports from Git commit history',
        author: 'Hermes Team',
        icon: '📊',
        category: 'productivity',
        entry: 'daily-report/index.js',
        configSchema: {
          type: 'object',
          properties: {
            repoPaths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Git repository paths to scan'
            },
            timeRange: {
              type: 'string',
              enum: ['today', 'yesterday', 'week'],
              default: 'today'
            },
            includeAllBranches: {
              type: 'boolean',
              default: true
            }
          }
        },
        enabled: true
      },
      {
        id: 'code-analysis',
        name: 'Code Analyzer',
        version: '1.0.0',
        description: 'Analyze code quality and metrics',
        author: 'Hermes Team',
        icon: '🔍',
        category: 'development',
        entry: 'code-analysis/index.js',
        enabled: false
      },
      {
        id: 'web-scraper',
        name: 'Web Scraper',
        version: '1.0.0',
        description: 'Scrape and extract data from websites',
        author: 'Hermes Team',
        icon: '🌐',
        category: 'utilities',
        entry: 'web-scraper/index.js',
        enabled: false
      }
    ];

    for (const plugin of builtInPlugins) {
      this.plugins.set(plugin.id, plugin);
      Logger.info(`Built-in plugin loaded: ${plugin.name}`);
    }
  }

  private async loadUserPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.pluginDir, entry.name);
          const manifestPath = path.join(pluginPath, 'plugin.json');

          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const plugin: Plugin = JSON.parse(manifestContent);

            if (plugin.id && plugin.name && plugin.entry) {
              this.plugins.set(plugin.id, plugin);
              Logger.info(`User plugin loaded: ${plugin.name}`);
            }
          } catch (error) {
            Logger.error(`Failed to load plugin from ${entry.name}:`, error);
          }
        }
      }
    } catch (error) {
      Logger.error('Failed to load user plugins:', error);
    }
  }

  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  async executePlugin(pluginId: string, params: any = {}): Promise<PluginExecutionResult> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      return {
        success: false,
        error: `Plugin not found: ${pluginId}`
      };
    }

    if (!plugin.enabled) {
      return {
        success: false,
        error: `Plugin is disabled: ${pluginId}`
      };
    }

    try {
      Logger.info(`Executing plugin: ${plugin.name}`);

      // 特殊处理日报生成插件
      if (pluginId === 'daily-report') {
        return await this.executeDailyReport(params);
      }

      // 通用插件执行
      const result = await this.executeGenericPlugin(plugin, params);

      Logger.info(`Plugin executed successfully: ${plugin.name}`);
      return result;

    } catch (error) {
      Logger.error(`Plugin execution failed: ${plugin.name}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async executeDailyReport(params: any): Promise<PluginExecutionResult> {
    const storedPaths = this.configManager.get('workPaths', []) as string[];
    const home = process.env.HOME || '';

    const repoPaths: string[] =
      params.repoPaths && params.repoPaths.length > 0
        ? params.repoPaths
        : storedPaths.filter(Boolean);

    const reportTemplate =
      (this.configManager.get('dailyReportTemplate') as string | undefined)?.trim() ||
      DEFAULT_DAILY_REPORT_TEMPLATE;

    const outputDir = params.outputDir
      ? path.resolve(params.outputDir.replace(/^~(?=\/|$)/, home))
      : path.join(home, 'daily-reports');

    // 构建Python脚本路径
    const scriptPath = path.join(__dirname, '../../scripts/generate_daily_report.py');

    if (!this.executorService) {
      throw new Error('Executor service not available');
    }

    const env: Record<string, string> = {
      REPO_PATHS: repoPaths.join(','),
      TIME_RANGE: params.timeRange || 'today',
      INCLUDE_ALL_BRANCHES: params.includeAllBranches !== false ? 'true' : 'false',
      DAILY_REPORT_TEMPLATE: reportTemplate,
      DAILY_REPORT_OUTPUT_DIR: outputDir,
      DAILY_REPORT_OUTPUT_FORMAT: 'json'
    };

    // Custom date range
    if (params.sinceDate) env.SINCE_DATE = params.sinceDate;
    if (params.untilDate) env.UNTIL_DATE = params.untilDate;

    const author = params.filterByAuthor as string | undefined;
    if (author && String(author).trim()) {
      env.FILTER_BY_AUTHOR = String(author).trim();
    }

    const result = await this.executorService.executeCommand(`python3 ${scriptPath}`, {
      cwd: home || undefined,
      env
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: result.stderr,
        logs: [result.stdout]
      };
    }

    // Extract actual output file path from Python stdout
    const stdout = result.stdout || '';
    const outputMatch = stdout.match(/__OUTPUT_FILE__:(.+)/);
    const reportPath = outputMatch ? outputMatch[1].trim() : '';

    let commits: any[] = [];
    let stats = { totalCommits: 0, totalRepos: 0, workHours: 0 };
    let reportContent = '';

    if (reportPath && reportPath.endsWith('.json')) {
      try {
        const jsonStr = await fs.readFile(reportPath, 'utf-8');
        const jsonData = JSON.parse(jsonStr);
        commits = jsonData.commits || [];
        stats = jsonData.stats || stats;
        reportContent = jsonData.report || '';
      } catch {
        // JSON file read failed, fall through to stdout fallback
      }
    }

    // Fallback: extract stats from stdout if commits are empty
    if (commits.length === 0) {
      const eqLines = [...stdout.matchAll(/^={10,}$/gm)].map(m => m.index!);
      if (eqLines.length >= 2) {
        reportContent = stdout.slice(eqLines[eqLines.length - 2], eqLines[eqLines.length - 1]).trim();
      } else {
        reportContent = stdout;
      }
      for (const line of reportContent.split('\n')) {
        const cm = line.match(/提交总数:\s*(\d+)/);
        if (cm) stats.totalCommits = parseInt(cm[1]);
        const rm = line.match(/涉及仓库:\s*(\d+)/);
        if (rm) stats.totalRepos = parseInt(rm[1]);
        const hm = line.match(/工作时间:\s*([\d.]+)/);
        if (hm) stats.workHours = parseFloat(hm[1]);
      }
    }

    // 尝试用 LLM 生成总结性日报
    if (commits.length > 0) {
      const dateRange = params.sinceDate
        ? `${params.sinceDate} ~ ${params.untilDate || '至今'}`
        : params.timeRange || 'today';

      const llmReport = await this.generateReportWithLLM(commits, dateRange);
      if (llmReport) {
        reportContent = llmReport;
      }
      // LLM 失败时保留模板填充的 reportContent
    }

    return {
      success: true,
      data: {
        report: reportContent,
        reportPath,
        stats,
        commits
      },
      logs: [result.stdout]
    };
  }

  private async generateReportWithLLM(commits: any[], dateRange: string): Promise<string | null> {
    if (!this.llmManager) {
      Logger.warn('LLM manager not available, skipping LLM report generation');
      return null;
    }

    // 优先使用日报专用的 provider/model 配置，否则回退到全局默认
    const configuredProvider = this.configManager.get('dailyReportProvider') as string | undefined;
    const configuredModel = this.configManager.get('dailyReportModel') as string | undefined;

    let providerId = configuredProvider && configuredProvider.trim()
      ? configuredProvider.trim()
      : null;

    if (!providerId) {
      providerId = this.llmManager.getDefaultProviderId();
    }

    if (!providerId) {
      Logger.warn('No LLM provider available for daily report');
      return null;
    }

    // 按仓库分组构造提交摘要
    const byRepo: Record<string, any[]> = {};
    for (const c of commits) {
      if (!byRepo[c.repo]) byRepo[c.repo] = [];
      byRepo[c.repo].push(c);
    }

    let commitsText = '';
    for (const [repo, repoCommits] of Object.entries(byRepo)) {
      commitsText += `\n### ${repo}\n`;
      for (const c of repoCommits) {
        commitsText += `- ${c.message}\n`;
      }
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `以下是 ${dateRange} 的 Git 提交记录，请整理为一份中文工作日报。按项目分类，直接罗列完成的工作事项，不需要展示提交次数、代码变更行数等统计信息。\n\n提交记录：${commitsText}`
      }
    ];

    try {
      Logger.info(`Generating report with LLM (provider: ${providerId}, model: ${configuredModel || 'default'})`);
      let report = await this.llmManager.chat(providerId, messages, configuredModel || undefined);
      // 去除思考过程标签
      report = report.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      Logger.info('LLM report generation succeeded');
      return report;
    } catch (error) {
      Logger.error('LLM report generation failed:', error);
      return null;
    }
  }

  private async executeGenericPlugin(plugin: Plugin, params: any): Promise<PluginExecutionResult> {
    // 这里可以实现通用的插件执行逻辑
    // 例如：加载插件模块、执行插件函数等

    return {
      success: true,
      data: { message: `Plugin ${plugin.name} executed successfully` },
      logs: []
    };
  }

  async togglePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.enabled = !plugin.enabled;
      this.emit('plugin-toggled', { pluginId, enabled: plugin.enabled });
      Logger.info(`Plugin ${plugin.name} ${plugin.enabled ? 'enabled' : 'disabled'}`);
    }
  }

  async installPlugin(pluginPath: string): Promise<void> {
    // 实现插件安装逻辑
    Logger.info(`Installing plugin from: ${pluginPath}`);
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    // 实现插件卸载逻辑
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      this.plugins.delete(pluginId);
      Logger.info(`Plugin uninstalled: ${plugin.name}`);
    }
  }
}
