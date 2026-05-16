import { randomUUID } from 'crypto';
import { PromptTemplate, PromptTemplateConfig } from '../../shared/types';
import { getDatabase } from '../database/connection';
import { Logger } from '../utils/Logger';

function normalizeTrigger(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/\s+/g, '-').toLowerCase();
}

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

function rowToPrompt(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'task',
    trigger: row.trigger,
    description: row.description || '',
    content: row.content,
    variables: JSON.parse(row.variables || '[]'),
    category: row.category || null,
    tags: JSON.parse(row.tags || '[]'),
    enabled: !!row.enabled,
    usage_count: row.usage_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PromptTemplateManager {
  initialize(): void {
    Logger.info('Initializing Prompt Template Manager...');
  }

  listPrompts(): PromptTemplate[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM prompt_templates
      ORDER BY updated_at DESC
    `).all() as any[];
    return rows.map(rowToPrompt);
  }

  createPrompt(config: PromptTemplateConfig): string {
    const db = getDatabase();
    const id = `prompt-${randomUUID().slice(0, 8)}`;
    const name = config.name.trim();
    const trigger = normalizeTrigger(config.trigger || config.name);
    const description = config.description?.trim() || '';
    const content = config.content.trim();
    const variables = JSON.stringify(extractVariables(content));
    const type = config.type || 'task';
    const category = config.category || null;
    const tags = JSON.stringify(config.tags || []);

    db.prepare(`
      INSERT INTO prompt_templates (id, name, type, trigger, description, content, variables, category, tags, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, trigger, description, content, variables, category, tags, config.enabled === false ? 0 : 1);

    Logger.info(`Prompt template created: ${name}`);
    return id;
  }

  updatePrompt(promptId: string, updates: Partial<PromptTemplateConfig>): void {
    const current = getDatabase()
      .prepare('SELECT * FROM prompt_templates WHERE id = ?')
      .get(promptId) as any;

    if (!current) {
      throw new Error(`Prompt template not found: ${promptId}`);
    }

    const content = updates.content !== undefined ? updates.content.trim() : current.content;
    const variables = JSON.stringify(extractVariables(content));

    const next = {
      name: updates.name !== undefined ? updates.name.trim() : current.name,
      type: updates.type !== undefined ? updates.type : (current.type || 'task'),
      trigger: updates.trigger !== undefined ? normalizeTrigger(updates.trigger) : current.trigger,
      description: updates.description !== undefined ? updates.description.trim() : (current.description || ''),
      content,
      variables,
      category: updates.category !== undefined ? updates.category : current.category,
      tags: updates.tags !== undefined ? JSON.stringify(updates.tags) : (current.tags || '[]'),
      enabled: updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : current.enabled,
    };

    getDatabase().prepare(`
      UPDATE prompt_templates
      SET name = ?, type = ?, trigger = ?, description = ?, content = ?, variables = ?, category = ?, tags = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(next.name, next.type, next.trigger, next.description, next.content, next.variables, next.category, next.tags, next.enabled, promptId);

    Logger.info(`Prompt template updated: ${next.name}`);
  }

  incrementUsage(promptId: string): void {
    getDatabase().prepare(`
      UPDATE prompt_templates SET usage_count = usage_count + 1, updated_at = updated_at WHERE id = ?
    `).run(promptId);
  }

  deletePrompt(promptId: string): void {
    getDatabase().prepare('DELETE FROM prompt_templates WHERE id = ?').run(promptId);
    Logger.info(`Prompt template deleted: ${promptId}`);
  }
}
