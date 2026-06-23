import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModuleType } from '../../shared/types';
import { Logger } from '../utils/Logger';

/**
 * better-sqlite3 的最小类型片段（避免在测试里依赖原生模块）。
 * 生产环境用真实 better-sqlite3，测试里可以注入 fake 实现。
 */
export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
}
export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}
export type SqliteOpener = (dbPath: string, options?: { readonly?: boolean; fileMustExist?: boolean }) => SqliteDatabase;

/**
 * 默认 opener：惰性 require better-sqlite3。
 * 用同步 require 而非动态 import，让 readCcSwitchProviders 保持同步签名。
 * （Electron 主进程 ABI 匹配；外部 Node 测试通过注入 fake opener 绕过 ABI 问题。）
 */
const defaultOpener: SqliteOpener = (dbPath, options) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  return new Database(dbPath, options);
};

/**
 * 候选 provider —— 从 cc-switch 解析出来、待写入 Ming 的标准化结构。
 * 不直接写入 DB，由 LLMProviderManager.importFromCcSwitch() 统一去重并落库。
 */
export interface CcSwitchCandidate {
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models: string[];
  /** cc-switch 的 provider id（跨 claude/claude-desktop 去重用） */
  sourceId: string;
}

/**
 * cc-switch providers 表的行结构（只保留 importer 用到的字段）。
 * 复合主键 (id, app_type)。
 */
interface CcSwitchRow {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
  is_current: number;
}

/** cc-switch settings_config 反序列化后 claude/claude-desktop 的形状 */
interface ClaudeSettingsConfig {
  env?: Record<string, string>;
}
/** codex 的 auth 块 */
interface CodexSettingsConfig {
  auth?: { OPENAI_API_KEY?: string | null };
  config?: string; // TOML 字符串
}

/**
 * 探测 cc-switch 的 SQLite 数据库路径。
 * 顺序：~/.cc-switch/cc-switch.db → 平台特定 AppData 路径。
 * 找不到返回 null。
 */
export function findCcSwitchDb(): string | null {
  const home = os.homedir();
  const candidates: string[] = [
    path.join(home, '.cc-switch', 'cc-switch.db'),
  ];

  if (process.platform === 'darwin') {
    candidates.push(
      path.join(home, 'Library', 'Application Support', 'cc-switch', 'cc-switch.db'),
    );
  } else if (process.platform === 'win32') {
    const appdata = process.env.APPDATA;
    if (appdata) candidates.push(path.join(appdata, 'cc-switch', 'cc-switch.db'));
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore stat errors, try next candidate
    }
  }
  return null;
}

/** 去重保序过滤 */
function uniqueStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * 轻量解析 codex settings_config.config (TOML) 里的 model 和 base_url。
 * codex 的 TOML 字段固定且简单，用正则即可，避免引入 TOML 库依赖。
 */
export function parseCodexToml(toml: string): { model?: string; baseURL?: string } {
  const modelMatch = toml.match(/^model\s*=\s*"([^"]+)"/m);
  const baseUrlMatch = toml.match(/base_url\s*=\s*"([^"]+)"/m);
  return {
    model: modelMatch?.[1],
    baseURL: baseUrlMatch?.[1],
  };
}

/** 解析 claude / claude-desktop 行 → 候选 provider。不可导入返回 null。 */
function parseClaudeProvider(row: CcSwitchRow): CcSwitchCandidate | null {
  let cfg: ClaudeSettingsConfig;
  try {
    cfg = JSON.parse(row.settings_config);
  } catch {
    Logger.warn(`cc-switch: 跳过无效 JSON (id=${row.id}, name=${row.name})`);
    return null;
  }

  const env = cfg.env || {};
  const apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 缺认证信息（可能 OAuth / 配置不全），跳过
    return null;
  }

  const baseURL = env.ANTHROPIC_BASE_URL;
  const models = uniqueStrings([
    env.ANTHROPIC_MODEL,
    env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  ]);

  if (!baseURL && models.length === 0) {
    // 既没 URL 又没 model，这条记录没价值
    return null;
  }

  return {
    name: row.name,
    presetId: 'anthropic',
    moduleType: 'anthropic',
    apiKey,
    baseURL,
    models,
    sourceId: row.id,
  };
}

/** 解析 codex 行 → 候选 provider。不可导入返回 null。 */
function parseCodexProvider(row: CcSwitchRow): CcSwitchCandidate | null {
  let cfg: CodexSettingsConfig;
  try {
    cfg = JSON.parse(row.settings_config);
  } catch {
    Logger.warn(`cc-switch: 跳过无效 JSON (id=${row.id}, name=${row.name})`);
    return null;
  }

  const apiKey = cfg.auth?.OPENAI_API_KEY ?? undefined;
  if (!apiKey) {
    // OPENAI_API_KEY 为 null → OAuth 登录，Ming 无法复用，跳过
    return null;
  }

  const toml = cfg.config || '';
  const { model, baseURL } = parseCodexToml(toml);
  const models = model ? [model] : [];

  if (!baseURL && models.length === 0) {
    return null;
  }

  return {
    name: row.name,
    presetId: 'custom',
    moduleType: 'openai-compatible',
    apiKey,
    baseURL,
    models,
    sourceId: row.id,
  };
}

/**
 * 读取 cc-switch.db 并解析出可导入的候选 provider 列表。
 *
 * - 用 readonly 模式打开（不锁住 cc-switch 自己的写入）
 * - app_type=claude / claude-desktop：按 ANTHROPIC_* 环境变量映射
 * - app_type=codex：从 auth.OPENAI_API_KEY + config(TOML) 解析
 * - app_type=gemini：跳过（基本是 OAuth 指针，无 key 可导）
 * - 同一 id 在 claude 和 claude-desktop 下各一行时去重
 * - 单行解析失败不影响其他行
 *
 * @param opener 可选，测试里注入 fake 避免依赖 better-sqlite3 原生模块
 */
export function readCcSwitchProviders(
  dbPath: string,
  opener: SqliteOpener = defaultOpener,
): CcSwitchCandidate[] {
  // fileMustExist 防止 better-sqlite3 误创建空库
  const db = opener(dbPath, { readonly: true, fileMustExist: true });

  let rows: CcSwitchRow[];
  try {
    const stmt = db.prepare(
      'SELECT id, app_type, name, settings_config, is_current FROM providers',
    );
    rows = stmt.all() as CcSwitchRow[];
  } finally {
    db.close();
  }

  // 排序：claude 优先（让 claude 行先进入 seenIds，claude-desktop 同 id 被去重）
  const appPriority: Record<string, number> = {
    claude: 0,
    'claude-desktop': 1,
    codex: 2,
    gemini: 3,
  };
  rows.sort((a, b) => (appPriority[a.app_type] ?? 99) - (appPriority[b.app_type] ?? 99));

  const seenIds = new Set<string>();
  const out: CcSwitchCandidate[] = [];
  for (const row of rows) {
    if (seenIds.has(row.id)) continue; // claude/claude-desktop 同 id 去重

    let candidate: CcSwitchCandidate | null = null;
    if (row.app_type === 'claude' || row.app_type === 'claude-desktop') {
      candidate = parseClaudeProvider(row);
    } else if (row.app_type === 'codex') {
      candidate = parseCodexProvider(row);
    }
    // gemini 和未知 app_type：跳过

    if (candidate) {
      seenIds.add(row.id);
      out.push(candidate);
    }
  }

  return out;
}
