import { getDatabase } from '../database/connection';
import { ToolExecutor } from './ToolExecutor';
import type { ToolRecord, ToolCreateConfig, ToolUpdateConfig } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { randomUUID } from 'crypto';

export class ToolPersistenceManager {
  private toolExecutor: ToolExecutor;

  constructor(toolExecutor: ToolExecutor) {
    this.toolExecutor = toolExecutor;
  }

  list(): ToolRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM tools ORDER BY updated_at DESC').all() as any[];
    return rows.map(this.rowToRecord);
  }

  get(toolId: string): ToolRecord | undefined {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    return row ? this.rowToRecord(row) : undefined;
  }

  create(config: ToolCreateConfig): string {
    const db = getDatabase();
    const id = `tool-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tools (id, name, display_name, description, category, parameters_schema, implementation_type, implementation_config, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      config.name.trim(),
      config.display_name.trim(),
      config.description || null,
      config.category || null,
      config.parameters_schema || null,
      config.implementation_type || 'builtin',
      config.implementation_config || null,
      config.is_enabled !== false ? 1 : 0,
      now,
      now,
    );

    Logger.info(`Tool created: ${config.name} (${id})`);
    return id;
  }

  update(toolId: string, config: ToolUpdateConfig): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!existing) throw new Error(`Tool not found: ${toolId}`);

    const sets: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (key === 'is_enabled') {
        sets.push('is_enabled = ?');
        values.push(value ? 1 : 0);
      } else {
        sets.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(toolId);

    db.prepare(`UPDATE tools SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    Logger.info(`Tool updated: ${toolId}`);
  }

  delete(toolId: string): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!existing) throw new Error(`Tool not found: ${toolId}`);

    db.prepare('DELETE FROM tools WHERE id = ?').run(toolId);
    Logger.info(`Tool deleted: ${toolId}`);
  }

  async execute(toolId: string, params: Record<string, any>): Promise<{ result: string; duration: number }> {
    const db = getDatabase();
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!tool) throw new Error(`Tool not found: ${toolId}`);
    if (!tool.is_enabled) throw new Error(`Tool is disabled: ${tool.name}`);

    const start = Date.now();
    let result: string;

    switch (tool.implementation_type) {
      case 'builtin':
        result = await this.toolExecutor.executeByName(tool.name, params);
        break;
      case 'http': {
        const config = JSON.parse(tool.implementation_config || '{}');
        if (!config.url) throw new Error('HTTP tool missing url in implementation_config');
        const resp = await fetch(config.url, {
          method: config.method || 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
          body: JSON.stringify(params),
        });
        result = JSON.stringify(await resp.json());
        break;
      }
      case 'script': {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const config = JSON.parse(tool.implementation_config || '{}');
        if (!config.command) throw new Error('Script tool missing command in implementation_config');
        const { stdout, stderr } = await execAsync(
          config.command,
          { timeout: config.timeout || 30000, env: { ...process.env, ...params } }
        );
        result = stderr ? `stderr: ${stderr}\nstdout: ${stdout}` : stdout;
        break;
      }
      default:
        throw new Error(`Unknown implementation type: ${tool.implementation_type}`);
    }

    const duration = Date.now() - start;

    db.prepare(`
      UPDATE tools SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?
    `).run(new Date().toISOString(), toolId);

    return { result, duration };
  }

  private rowToRecord(row: any): ToolRecord {
    return {
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      description: row.description || '',
      category: row.category,
      parameters_schema: row.parameters_schema,
      implementation_type: row.implementation_type || 'builtin',
      implementation_config: row.implementation_config,
      is_enabled: !!row.is_enabled,
      usage_count: row.usage_count || 0,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
