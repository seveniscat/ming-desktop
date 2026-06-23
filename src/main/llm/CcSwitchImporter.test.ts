import { describe, it, expect } from 'vitest';
import {
  readCcSwitchProviders,
  parseCodexToml,
  SqliteDatabase,
  SqliteOpener,
} from './CcSwitchImporter';

/**
 * 测试环境里 better-sqlite3 的原生模块 ABI 跟外部 Node 不兼容
 * （它编译给 Electron 的 NODE_MODULE_VERSION）。
 * 所以这里用一个纯 JS 的 fake opener：把行数据存在内存里，实现 prepare().all()。
 * 这也顺带让测试更快、更聚焦于解析逻辑。
 */
interface Row {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
  is_current: number;
}

function fakeOpener(rows: Row[]): SqliteOpener {
  return () => {
    const db: SqliteDatabase = {
      prepare: (_sql: string) => ({
        all: () => rows.slice(),
      }),
      close: () => {},
    };
    return db;
  };
}

interface SeedRow {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
  is_current?: number;
}

/** 快捷构造：把 settingsConfig 对象序列化进 row */
function row(id: string, app_type: string, name: string, settingsConfig: unknown, is_current = 0): SeedRow {
  return {
    id,
    app_type,
    name,
    settings_config:
      typeof settingsConfig === 'string' ? settingsConfig : JSON.stringify(settingsConfig),
    is_current,
  };
}

function read(rows: SeedRow[]) {
  return readCcSwitchProviders('<fake>', fakeOpener(rows as Row[]));
}

describe('parseCodexToml', () => {
  it('extracts model and base_url from codex config TOML', () => {
    const toml = `
model_provider = "custom"
model = "glm-5.1"

[model_providers.zhipu]
name = "zhipu"
wire_api = "responses"
base_url = "https://open.bigmodel.cn/api/paas/v4"
`;
    const result = parseCodexToml(toml);
    expect(result.model).toBe('glm-5.1');
    expect(result.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4');
  });

  it('returns undefined when fields absent', () => {
    const result = parseCodexToml('model_provider = "custom"');
    expect(result.model).toBeUndefined();
    expect(result.baseURL).toBeUndefined();
  });
});

describe('readCcSwitchProviders', () => {
  it('parses claude provider with ANTHROPIC_AUTH_TOKEN', () => {
    const result = read([
      row('claude-1', 'claude', '智谱', {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'token-abc',
          ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
          ANTHROPIC_MODEL: 'glm-5.2',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.5-air',
        },
      },
      1),
    ]);

    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.name).toBe('智谱');
    expect(p.presetId).toBe('anthropic');
    expect(p.moduleType).toBe('anthropic');
    expect(p.apiKey).toBe('token-abc');
    expect(p.baseURL).toBe('https://open.bigmodel.cn/api/anthropic');
    expect(p.models).toEqual(
      expect.arrayContaining(['glm-5.2', 'glm-4.7', 'glm-4.5-air']),
    );
    expect(p.models).toHaveLength(3); // 去重后
    expect(p.sourceId).toBe('claude-1');
  });

  it('falls back to ANTHROPIC_API_KEY when no AUTH_TOKEN', () => {
    const result = read([
      row('gemini-native', 'claude', 'Gemini Native', {
        env: {
          ANTHROPIC_API_KEY: 'gemini-key',
          ANTHROPIC_BASE_URL: 'https://generativelanguage.googleapis.com',
          ANTHROPIC_MODEL: 'gemini-3.1-pro',
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].apiKey).toBe('gemini-key');
    expect(result[0].models).toEqual(['gemini-3.1-pro']);
  });

  it('dedupes the same id across claude and claude-desktop', () => {
    const cfg = {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'tok',
        ANTHROPIC_BASE_URL: 'https://x.example/anthropic',
        ANTHROPIC_MODEL: 'glm-5.2',
      },
    };
    const result = read([
      row('shared-1', 'claude', '智谱', cfg),
      row('shared-1', 'claude-desktop', '智谱', cfg),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('shared-1');
  });

  it('parses codex provider (auth key + TOML base_url + model)', () => {
    const codexToml = `
model_provider = "custom"
model = "glm-5.1"

[model_providers.zhipu]
name = "zhipu"
base_url = "https://open.bigmodel.cn/api/coding/paas/v4"
`;
    const result = read([
      row('codex-1', 'codex', '智谱 GLM (Codex)', {
        auth: { OPENAI_API_KEY: 'sk-codex-xyz' },
        config: codexToml,
      }),
    ]);

    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.name).toBe('智谱 GLM (Codex)');
    expect(p.presetId).toBe('custom');
    expect(p.moduleType).toBe('openai-compatible');
    expect(p.apiKey).toBe('sk-codex-xyz');
    expect(p.baseURL).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
    expect(p.models).toEqual(['glm-5.1']);
  });

  it('skips codex provider when OPENAI_API_KEY is null (OAuth)', () => {
    const result = read([
      row('codex-oauth', 'codex', 'ChatGPT OAuth', {
        auth: { OPENAI_API_KEY: null, auth_mode: 'chatgpt' },
        config: 'model = "gpt-5"',
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it('skips gemini providers (env empty, no api key)', () => {
    const result = read([
      row('gemini-1', 'gemini', 'Gemini Official', { env: {}, config: {} }),
    ]);

    expect(result).toHaveLength(0);
  });

  it('skips rows with corrupted settings_config JSON without aborting the batch', () => {
    const result = read([
      row('broken', 'claude', 'Broken', '{ this is not valid json'),
      row('good', 'claude', 'Good', {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'tok',
          ANTHROPIC_BASE_URL: 'https://g.example/anthropic',
          ANTHROPIC_MODEL: 'm1',
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('good');
  });

  it('skips claude provider missing both AUTH_TOKEN and API_KEY', () => {
    const result = read([
      row('no-auth', 'claude', 'No Auth', {
        env: {
          ANTHROPIC_BASE_URL: 'https://x.example/anthropic',
          ANTHROPIC_MODEL: 'm1',
        },
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it('handles mixed batch (claude + codex + gemini) end-to-end', () => {
    const result = read([
      row('c1', 'claude', '智谱', {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'tok1',
          ANTHROPIC_BASE_URL: 'https://a.example',
          ANTHROPIC_MODEL: 'glm-5.2',
        },
      }),
      row('c2', 'codex', 'Codex', {
        auth: { OPENAI_API_KEY: 'tok2' },
        config: 'model = "gpt-5"\nbase_url = "https://b.example/v1"',
      }),
      row('c3', 'gemini', 'Gemini', { env: {} }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.sourceId).sort()).toEqual(['c1', 'c2']);
    expect(result.find((p) => p.sourceId === 'c1')?.moduleType).toBe('anthropic');
    expect(result.find((p) => p.sourceId === 'c2')?.moduleType).toBe('openai-compatible');
  });
});
