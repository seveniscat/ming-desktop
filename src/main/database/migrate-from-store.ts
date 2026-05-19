import { getDatabase } from './connection';
import { ConfigManager } from '../services/ConfigManager';
import { Logger } from '../utils/Logger';

/**
 * One-time migration of data from electron-store to SQLite.
 * Idempotent — safe to run multiple times.
 */
export function migrateFromStore(configManager: ConfigManager): void {
  const db = getDatabase();

  // Check if migration already done
  const row = db.prepare("SELECT 1 FROM _migrations WHERE name = 'migrate-from-store'").get();
  if (row) return;

  Logger.info('Migrating data from electron-store to SQLite...');

  // Migrate LLM providers
  try {
    const providers = configManager.get('llmProviders', []) as any[];
    if (Array.isArray(providers) && providers.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO llm_providers (id, name, type, api_key, base_url, models, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      for (const p of providers) {
        if (p.id) {
          stmt.run(p.id, p.name || '', p.type || 'openai', p.apiKey || p.api_key || null, p.baseUrl || p.base_url || null, JSON.stringify(p.models || []), p.enabled !== false ? 1 : 0);
        }
      }
      Logger.info(`Migrated ${providers.length} LLM providers`);
    }
  } catch (e) {
    Logger.error('Failed to migrate LLM providers', e);
  }

  // Migrate agents
  try {
    const agents = configManager.get('agents', []) as any[];
    if (Array.isArray(agents) && agents.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO agents (id, name, description, model, system_prompt, tools, skills, enabled, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      for (const a of agents) {
        if (a.id) {
          stmt.run(
            a.id,
            a.name || '',
            a.description || '',
            a.model || '',
            a.systemPrompt || a.system_prompt || '',
            JSON.stringify(a.tools || []),
            JSON.stringify(a.skills || []),
            a.enabled !== false ? 1 : 0,
            a.isDefault || a.is_default ? 1 : 0
          );
        }
      }
      Logger.info(`Migrated ${agents.length} agents`);
    }
  } catch (e) {
    Logger.error('Failed to migrate agents', e);
  }

  // Migrate skills
  try {
    const skills = configManager.get('skills', []) as any[];
    if (Array.isArray(skills) && skills.length > 0) {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO skills (id, name, description, prompt, enabled, source_path, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      for (const skill of skills) {
        if (skill.id) {
          stmt.run(
            skill.id,
            skill.name || '',
            skill.description || '',
            skill.prompt || '',
            skill.enabled !== false ? 1 : 0,
            skill.sourcePath || skill.source_path || null,
            skill.sourceType || skill.source_type || null
          );
        }
      }
      Logger.info(`Migrated ${skills.length} skills`);
    }
  } catch (e) {
    Logger.error('Failed to migrate skills', e);
  }

  // Mark migration as done
  db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES ('migrate-from-store')").run();
  Logger.info('Migration from electron-store complete');
}
