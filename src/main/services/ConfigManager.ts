import Store from 'electron-store';
import { AppConfig } from '../../shared/types';
import {
  DEFAULT_DAILY_REPORT_TEMPLATE,
  DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT
} from '../../shared/dailyReportDefaults';
import { Logger } from '../utils/Logger';

const DEFAULT_CONFIG: AppConfig = {
  theme: 'dark',
  language: 'zh-CN',
  autoUpdate: true,
  workPaths: [] as string[],
  dailyReportTemplate: DEFAULT_DAILY_REPORT_TEMPLATE,
  dailyReporterSystemPrompt: DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT,
  dailyReportProvider: '',
  dailyReportModel: '',
  plugins: {},
  agents: [],
  llmProviders: []
};

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      defaults: DEFAULT_CONFIG,
      name: 'ming-desktop-config'
    });
  }

  async initialize(): Promise<void> {
    Logger.info('Initializing Config Manager...');

    // 确保默认配置存在
    if (this.store.size === 0) {
      await this.setAll(DEFAULT_CONFIG);
    }

    Logger.info('Config Manager initialized');
  }

  get<T>(key: string, defaultValue?: T): T {
    return this.store.get(key as keyof AppConfig, defaultValue as never) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key as keyof AppConfig, value as any);
    Logger.debug(`Config updated: ${key}`);
  }

  async setAll(config: Partial<AppConfig>): Promise<void> {
    Object.entries(config).forEach(([key, value]) => {
      this.store.set(key as keyof AppConfig, value as any);
    });
  }

  getAll(): AppConfig {
    return this.store.store;
  }

  async reset(): Promise<void> {
    this.store.clear();
    await this.setAll(DEFAULT_CONFIG);
    Logger.info('Config reset to defaults');
  }

  has(key: string): boolean {
    return this.store.has(key as keyof AppConfig);
  }

  delete(key: string): void {
    this.store.delete(key as keyof AppConfig);
  }

  // 获取工作路径配置
  getWorkPaths(): string[] {
    return this.get('workPaths', DEFAULT_CONFIG.workPaths);
  }

  // 更新工作路径配置
  async setWorkPaths(paths: string[]): Promise<void> {
    await this.set('workPaths', paths);
  }

  // 获取主题设置
  getTheme(): AppConfig['theme'] {
    return this.get('theme', DEFAULT_CONFIG.theme);
  }

  // 设置主题
  async setTheme(theme: AppConfig['theme']): Promise<void> {
    await this.set('theme', theme);
  }
}
