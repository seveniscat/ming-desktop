import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Skill, SkillConfig, SkillSyncResult } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { getDatabase } from '../database/connection';

interface LocalSkillCandidate extends Required<Pick<SkillConfig, 'name' | 'description' | 'prompt' | 'sourcePath' | 'sourceType'>> {
  id: string;
}

export class SkillManager extends EventEmitter {
  private skills: Map<string, Skill> = new Map();

  async initialize(): Promise<void> {
    Logger.info('Initializing Skill Manager...');

    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM skills ORDER BY updated_at DESC, created_at DESC').all() as any[];

    for (const row of rows) {
      const skill: Skill = {
        id: row.id,
        name: row.name,
        description: row.description || '',
        prompt: row.prompt || '',
        enabled: !!row.enabled,
        sourcePath: row.source_path || undefined,
        sourceType: row.source_type || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      this.skills.set(skill.id, skill);
    }

    Logger.info(`Initialized ${this.skills.size} skills`);
  }

  listSkills(): Skill[] {
    return Array.from(this.skills.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  async createSkill(config: SkillConfig): Promise<string> {
    const skill: Skill = {
      id: `skill-${randomUUID().slice(0, 8)}`,
      name: config.name.trim(),
      description: config.description?.trim() ?? '',
      prompt: config.prompt.trim(),
      enabled: config.enabled !== false,
      sourcePath: config.sourcePath,
      sourceType: config.sourceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.skills.set(skill.id, skill);

    const db = getDatabase();
    db.prepare(`
      INSERT INTO skills (id, name, description, prompt, enabled, source_path, source_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      skill.id,
      skill.name,
      skill.description,
      skill.prompt,
      skill.enabled ? 1 : 0,
      skill.sourcePath || null,
      skill.sourceType || null,
      skill.createdAt,
      skill.updatedAt
    );

    this.emit('skill-created', skill);
    Logger.info(`Skill created: ${skill.name}`);

    return skill.id;
  }

  async updateSkill(skillId: string, updates: Partial<Skill>): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    const updated: Skill = {
      ...skill,
      ...updates,
      name: updates.name?.trim() ?? skill.name,
      description: updates.description?.trim() ?? skill.description,
      prompt: updates.prompt?.trim() ?? skill.prompt,
      sourcePath: updates.sourcePath ?? skill.sourcePath,
      sourceType: updates.sourceType ?? skill.sourceType,
      updatedAt: new Date().toISOString(),
    };

    this.skills.set(skillId, updated);

    const db = getDatabase();
    db.prepare(`
      UPDATE skills
      SET name = ?, description = ?, prompt = ?, enabled = ?, source_path = ?, source_type = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.description,
      updated.prompt,
      updated.enabled ? 1 : 0,
      updated.sourcePath || null,
      updated.sourceType || null,
      updated.updatedAt,
      skillId
    );

    this.emit('skill-updated', updated);
    Logger.info(`Skill updated: ${updated.name}`);
  }

  async deleteSkill(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    this.skills.delete(skillId);

    const db = getDatabase();
    db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);

    this.emit('skill-deleted', skillId);
    Logger.info(`Skill deleted: ${skill.name}`);
  }

  async syncLocalSkills(): Promise<SkillSyncResult> {
    const candidates = this.findLocalSkills();
    const db = getDatabase();
    let created = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const candidate of candidates) {
      const existing = this.skills.get(candidate.id);

      if (existing) {
        const next: Skill = {
          ...existing,
          name: candidate.name,
          description: candidate.description,
          prompt: candidate.prompt,
          sourcePath: candidate.sourcePath,
          sourceType: candidate.sourceType,
          updatedAt: now,
        };
        this.skills.set(next.id, next);
        db.prepare(`
          UPDATE skills
          SET name = ?, description = ?, prompt = ?, source_path = ?, source_type = ?, updated_at = ?
          WHERE id = ?
        `).run(next.name, next.description, next.prompt, next.sourcePath, next.sourceType, next.updatedAt, next.id);
        updated++;
      } else {
        const skill: Skill = {
          id: candidate.id,
          name: candidate.name,
          description: candidate.description,
          prompt: candidate.prompt,
          enabled: true,
          sourcePath: candidate.sourcePath,
          sourceType: candidate.sourceType,
          createdAt: now,
          updatedAt: now,
        };
        this.skills.set(skill.id, skill);
        db.prepare(`
          INSERT INTO skills (id, name, description, prompt, enabled, source_path, source_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          skill.id,
          skill.name,
          skill.description,
          skill.prompt,
          1,
          skill.sourcePath,
          skill.sourceType,
          skill.createdAt,
          skill.updatedAt
        );
        created++;
      }
    }

    Logger.info(`Synced local skills: ${created} created, ${updated} updated`);

    return {
      total: candidates.length,
      created,
      updated,
      skipped: 0,
      skills: this.listSkills(),
    };
  }

  private findLocalSkills(): LocalSkillCandidate[] {
    const homeDir = os.homedir();
    const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex');
    const roots = [
      { dir: path.join(codexHome, 'skills'), depth: 5 },
      { dir: path.join(homeDir, '.agents', 'skills'), depth: 5 },
      { dir: path.join(codexHome, 'plugins', 'cache'), depth: 9 },
    ];

    const seen = new Set<string>();
    const candidates: LocalSkillCandidate[] = [];

    for (const root of roots) {
      for (const skillFile of this.findSkillFiles(root.dir, root.depth)) {
        const sourcePath = path.resolve(skillFile);
        if (seen.has(sourcePath)) continue;
        seen.add(sourcePath);

        try {
          const content = fs.readFileSync(sourcePath, 'utf-8');
          const parsed = this.parseSkillFile(content, sourcePath);
          candidates.push(parsed);
        } catch (error) {
          Logger.error(`Failed to read local skill: ${sourcePath}`, error);
        }
      }
    }

    return candidates.sort((a, b) => a.name.localeCompare(b.name));
  }

  private findSkillFiles(rootDir: string, maxDepth: number): string[] {
    if (!fs.existsSync(rootDir) || maxDepth < 0) return [];

    const files: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return files;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const fullPath = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name === 'SKILL.md') {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        files.push(...this.findSkillFiles(fullPath, maxDepth - 1));
      }
    }

    return files;
  }

  private parseSkillFile(content: string, sourcePath: string): LocalSkillCandidate {
    const { metadata, body } = this.extractFrontmatter(content);
    const name = metadata.name || path.basename(path.dirname(sourcePath));
    const description = metadata.description || '';

    return {
      id: `local-${createHash('sha1').update(sourcePath).digest('hex').slice(0, 12)}`,
      name,
      description,
      prompt: body || content.trim(),
      sourcePath,
      sourceType: this.getSourceType(sourcePath),
    };
  }

  private extractFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
    if (!content.startsWith('---')) {
      return { metadata: {}, body: content.trim() };
    }

    const endIndex = content.indexOf('\n---', 3);
    if (endIndex === -1) {
      return { metadata: {}, body: content.trim() };
    }

    const rawFrontmatter = content.slice(3, endIndex).trim();
    const body = content.slice(endIndex + 4).trim();
    const metadata: Record<string, string> = {};

    for (const line of rawFrontmatter.split('\n')) {
      if (/^\s/.test(line)) continue;

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      const value = this.unquoteYamlValue(line.slice(separatorIndex + 1).trim());
      if (key && value) {
        metadata[key] = value;
      }
    }

    return { metadata, body };
  }

  private unquoteYamlValue(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  private getSourceType(sourcePath: string): string {
    const normalized = sourcePath.split(path.sep).join('/');
    if (normalized.includes('/.codex/skills/.system/')) return 'codex-system';
    if (normalized.includes('/.codex/plugins/cache/')) return 'plugin';
    if (normalized.includes('/.codex/skills/')) return 'codex';
    if (normalized.includes('/.agents/skills/')) return 'agents';
    return 'local';
  }
}
