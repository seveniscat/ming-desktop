import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { app } from 'electron';
import { Skill, SkillConfig, SkillParameter, SkillSyncResult, SkillFile } from '../../shared/types';
import { DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT, DEFAULT_WEEKLY_REPORTER_SYSTEM_PROMPT } from '../../shared/dailyReportDefaults';
import { Logger } from '../utils/Logger';
import { getDatabase } from '../database/connection';

interface LocalSkillCandidate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  folderPath: string;
  sourceType: string;
}

export class SkillManager extends EventEmitter {
  private skills: Map<string, Skill> = new Map();
  private skillsCache: Map<string, string> = new Map(); // skillId -> prompt content cache

  getSkillsRoot(): string {
    return path.join(app.getPath('userData'), 'skills');
  }

  async initialize(): Promise<void> {
    Logger.info('Initializing Skill Manager...');

    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM skills ORDER BY updated_at DESC, created_at DESC').all() as any[];

    for (const row of rows) {
      const skill: Skill = {
        id: row.id,
        name: row.name,
        description: row.description || '',
        folderPath: row.folder_path || path.join(this.getSkillsRoot(), row.id),
        autoMessage: row.auto_message || undefined,
        parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
        enabled: !!row.enabled,
        sourceType: row.source_type || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      this.skills.set(skill.id, skill);
    }

    Logger.info(`Initialized ${this.skills.size} skills`);

    this.ensureBuiltInSkills();
  }

  listSkills(): Skill[] {
    return Array.from(this.skills.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  getSkillPrompt(skillId: string): string {
    const skill = this.skills.get(skillId);
    if (!skill) return '';

    // Check cache first
    if (this.skillsCache.has(skillId)) {
      return this.skillsCache.get(skillId) || '';
    }

    try {
      const skillMdPath = path.join(skill.folderPath, 'SKILL.md');
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const { body } = this.parseFrontmatter(content);
      
      // Cache it
      this.skillsCache.set(skillId, body);
      return body;
    } catch (error) {
      Logger.error(`Failed to read skill prompt: ${skillId}`, error);
      return '';
    }
  }

  async createSkill(config: SkillConfig): Promise<string> {
    const id = `skill-${randomUUID().slice(0, 8)}`;
    const skillsDir = this.getSkillsRoot();
    const folderPath = config.folderPath || path.join(skillsDir, id);

    // Create folder
    fs.mkdirSync(folderPath, { recursive: true });

    // Create SKILL.md
    const skillMdPath = path.join(folderPath, 'SKILL.md');
    const frontmatter = `---\nname: ${config.name}\ndescription: ${config.description || ''}\n---\n\n`;
    fs.writeFileSync(skillMdPath, frontmatter, 'utf-8');

    const skill: Skill = {
      id,
      name: config.name.trim(),
      description: config.description?.trim() ?? '',
      folderPath,
      enabled: config.enabled !== false,
      sourceType: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.skills.set(skill.id, skill);

    const db = getDatabase();
    db.prepare(`
      INSERT INTO skills (id, name, description, folder_path, enabled, source_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      skill.id,
      skill.name,
      skill.description,
      skill.folderPath,
      skill.enabled ? 1 : 0,
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
      folderPath: updates.folderPath ?? skill.folderPath,
      sourceType: updates.sourceType ?? skill.sourceType,
      updatedAt: new Date().toISOString(),
    };

    this.skills.set(skillId, updated);

    // Update SKILL.md frontmatter if name or description changed
    if (updates.name || updates.description) {
      try {
        const skillMdPath = path.join(skill.folderPath, 'SKILL.md');
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const { body } = this.parseFrontmatter(content);
        const frontmatter = `---\nname: ${updated.name}\ndescription: ${updated.description}\n---\n\n`;
        fs.writeFileSync(skillMdPath, frontmatter + body, 'utf-8');
        
        // Clear cache
        this.skillsCache.delete(skillId);
      } catch (error) {
        Logger.error(`Failed to update SKILL.md: ${skillId}`, error);
      }
    }

    const db = getDatabase();
    db.prepare(`
      UPDATE skills
      SET name = ?, description = ?, folder_path = ?, enabled = ?, source_type = ?, parameters = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.description,
      updated.folderPath,
      updated.enabled ? 1 : 0,
      updated.sourceType || null,
      updated.parameters ? JSON.stringify(updated.parameters) : null,
      updated.updatedAt,
      skillId
    );

    this.emit('skill-updated', updated);
    Logger.info(`Skill updated: ${updated.name}`);
  }

  async deleteSkill(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    // Delete folder
    try {
      fs.rmSync(skill.folderPath, { recursive: true, force: true });
    } catch (error) {
      Logger.error(`Failed to delete skill folder: ${skill.folderPath}`, error);
    }

    this.skills.delete(skillId);
    this.skillsCache.delete(skillId);

    const db = getDatabase();
    db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);

    this.emit('skill-deleted', skillId);
    Logger.info(`Skill deleted: ${skill.name}`);
  }

  // File management methods
  getSkillFiles(skillId: string): SkillFile[] {
    const skill = this.skills.get(skillId);
    if (!skill) return [];

    return this.listFilesRecursively(skill.folderPath, skill.folderPath);
  }

  async readSkillFile(skillId: string, filePath: string): Promise<string> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error('Skill not found');

    const absolutePath = path.join(skill.folderPath, filePath);
    
    // Security check: ensure file is within skill folder
    if (!absolutePath.startsWith(skill.folderPath)) {
      throw new Error('Invalid file path');
    }

    return fs.readFileSync(absolutePath, 'utf-8');
  }

  async writeSkillFile(skillId: string, filePath: string, content: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error('Skill not found');

    const absolutePath = path.join(skill.folderPath, filePath);
    
    // Security check
    if (!absolutePath.startsWith(skill.folderPath)) {
      throw new Error('Invalid file path');
    }

    // Create parent directories if needed
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');

    // Clear cache if writing SKILL.md
    if (filePath === 'SKILL.md') {
      this.skillsCache.delete(skillId);
    }
  }

  async deleteSkillFile(skillId: string, filePath: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error('Skill not found');

    // Prevent deleting SKILL.md
    if (filePath === 'SKILL.md') {
      throw new Error('Cannot delete SKILL.md');
    }

    const absolutePath = path.join(skill.folderPath, filePath);
    
    // Security check
    if (!absolutePath.startsWith(skill.folderPath)) {
      throw new Error('Invalid file path');
    }

    fs.rmSync(absolutePath, { recursive: true, force: true });
  }

  private listFilesRecursively(dir: string, baseDir: string): SkillFile[] {
    const files: SkillFile[] = [];
    
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        files.push({
          name: entry.name,
          path: relativePath,
          size: 0,
          modifiedAt: fs.statSync(fullPath).mtime.toISOString(),
          isDirectory: true,
        });
        files.push(...this.listFilesRecursively(fullPath, baseDir));
      } else {
        const stat = fs.statSync(fullPath);
        files.push({
          name: entry.name,
          path: relativePath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          isDirectory: false,
        });
      }
    }

    return files;
  }

  /**
   * Import a skill from a ZIP file.
   * Unzips into the skills directory and registers it.
   * The ZIP should contain either:
   *   - A single folder with SKILL.md inside, OR
   *   - SKILL.md at the root (we wrap it in a folder)
   */
  async importZip(zipPath: string): Promise<{ skillId: string; skillName: string }> {
    if (!fs.existsSync(zipPath)) throw new Error('ZIP file not found');

    const skillsDir = this.getSkillsRoot();
    const tmpDir = path.join(skillsDir, `.tmp-import-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Unzip using system unzip command (available on macOS/Linux)
      await new Promise<void>((resolve, reject) => {
        execFile('unzip', ['-o', '-q', zipPath, '-d', tmpDir], (error) => {
          if (error) reject(new Error(`Failed to unzip: ${error.message}`));
          else resolve();
        });
      });

      // Find SKILL.md in the extracted content
      const skillSourceDir = this.findSkillSourceDir(tmpDir);
      if (!skillSourceDir) {
        throw new Error('No SKILL.md found in ZIP. Make sure the ZIP contains a valid skill folder.');
      }

      // Determine skill name from SKILL.md frontmatter or folder name
      const skillMdContent = fs.readFileSync(path.join(skillSourceDir, 'SKILL.md'), 'utf-8');
      const { metadata } = this.parseFrontmatter(skillMdContent);
      const skillName = metadata.name || path.basename(skillSourceDir);

      // Generate a unique folder name
      const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const targetDir = path.join(skillsDir, `imported-${slug}-${randomUUID().slice(0, 6)}`);

      // Move skill folder to final location
      fs.renameSync(skillSourceDir, targetDir);

      // Sync to pick up the new skill
      await this.syncLocalSkills();

      // Find the newly imported skill by folder path
      const imported = Array.from(this.skills.values()).find(s => s.folderPath === targetDir);
      if (!imported) throw new Error('Failed to register imported skill');

      this.emit('skill-imported', imported);
      Logger.info(`Skill imported from ZIP: ${imported.name}`);

      return { skillId: imported.id, skillName: imported.name };
    } finally {
      // Clean up temp directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Find the directory containing SKILL.md in the extracted ZIP.
   * Handles both:
   *   - ZIP with a single folder containing SKILL.md
   *   - ZIP with SKILL.md at root level
   */
  private findSkillSourceDir(extractDir: string): string | null {
    // Check if SKILL.md is directly in the extract dir
    if (fs.existsSync(path.join(extractDir, 'SKILL.md'))) {
      return extractDir;
    }

    // Look for a single subdirectory with SKILL.md
    const entries = fs.readdirSync(extractDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && e.name !== '__MACOSX' && !e.name.startsWith('.'));

    if (dirs.length === 1) {
      const subDir = path.join(extractDir, dirs[0].name);
      if (fs.existsSync(path.join(subDir, 'SKILL.md'))) {
        return subDir;
      }
    }

    // Search deeper for SKILL.md
    for (const dir of dirs) {
      const result = this.findSkillSourceDir(path.join(extractDir, dir.name));
      if (result) return result;
    }

    return null;
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
          folderPath: candidate.folderPath,
          sourceType: candidate.sourceType,
          updatedAt: now,
        };
        this.skills.set(next.id, next);
        db.prepare(`
          UPDATE skills
          SET name = ?, description = ?, folder_path = ?, source_type = ?, updated_at = ?
          WHERE id = ?
        `).run(next.name, next.description, next.folderPath, next.sourceType, next.updatedAt, next.id);
        updated++;
      } else {
        const skill: Skill = {
          id: candidate.id,
          name: candidate.name,
          description: candidate.description,
          folderPath: candidate.folderPath,
          enabled: true,
          sourceType: candidate.sourceType,
          createdAt: now,
          updatedAt: now,
        };
        this.skills.set(skill.id, skill);
        db.prepare(`
          INSERT INTO skills (id, name, description, folder_path, enabled, source_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          skill.id,
          skill.name,
          skill.description,
          skill.folderPath,
          1,
          skill.sourceType,
          skill.createdAt,
          skill.updatedAt
        );
        created++;
      }
      
      // Clear cache for synced skills
      this.skillsCache.delete(candidate.id);
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
      for (const skillDir of this.findSkillDirectories(root.dir, root.depth)) {
        const folderPath = path.resolve(skillDir);
        if (seen.has(folderPath)) continue;
        seen.add(folderPath);

        try {
          const skillMdPath = path.join(folderPath, 'SKILL.md');
          if (!fs.existsSync(skillMdPath)) continue;
          
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = this.parseSkillFile(content, folderPath);
          candidates.push(parsed);
        } catch (error) {
          Logger.error(`Failed to read local skill: ${folderPath}`, error);
        }
      }
    }

    return candidates.sort((a, b) => a.name.localeCompare(b.name));
  }

  private findSkillDirectories(rootDir: string, maxDepth: number): string[] {
    if (!fs.existsSync(rootDir) || maxDepth < 0) return [];

    const dirs: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return dirs;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        // Check if this directory contains SKILL.md
        const skillMdPath = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          dirs.push(fullPath);
        } else if (maxDepth > 0) {
          dirs.push(...this.findSkillDirectories(fullPath, maxDepth - 1));
        }
      }
    }

    return dirs;
  }

  private parseSkillFile(content: string, folderPath: string): LocalSkillCandidate {
    const { metadata, body } = this.parseFrontmatter(content);
    const name = metadata.name || path.basename(folderPath);
    const description = metadata.description || '';

    return {
      id: `local-${createHash('sha1').update(folderPath).digest('hex').slice(0, 12)}`,
      name,
      description,
      prompt: body || content.trim(),
      folderPath,
      sourceType: this.getSourceType(folderPath),
    };
  }

  private parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
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

  private getSourceType(folderPath: string): string {
    const normalized = folderPath.split(path.sep).join('/');
    if (normalized.includes('/.codex/skills/.system/')) return 'codex-system';
    if (normalized.includes('/.codex/plugins/cache/')) return 'plugin';
    if (normalized.includes('/.codex/skills/')) return 'codex';
    if (normalized.includes('/.agents/skills/')) return 'agents';
    return 'local';
  }

  private ensureBuiltInSkills(): void {
    const skillsDir = this.getSkillsRoot();
    
    const builtInSkills: Array<{ id: string; name: string; description: string; prompt: string; autoMessage?: string; parameters?: SkillParameter[] }> = [
      {
        id: 'builtin-daily-reporter',
        name: '日报生成器',
        description: '根据 Git 提交记录生成工作日报',
        prompt: DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT,
        autoMessage: '生成{timeRange}的工作日报',
        parameters: [{
          name: 'timeRange',
          label: '日期范围',
          type: 'select',
          options: [
            { label: '今天', value: '今天' },
            { label: '昨天', value: '昨天' },
            { label: '前天', value: '前天' },
            { label: '本周', value: '本周' },
          ],
        }],
      },
      {
        id: 'builtin-weekly-reporter',
        name: '周报生成器',
        description: '根据本周 Git 提交记录生成工作周报',
        prompt: DEFAULT_WEEKLY_REPORTER_SYSTEM_PROMPT,
        autoMessage: '生成本周的工作周报',
      },
    ];

    for (const def of builtInSkills) {
      const folderPath = path.join(skillsDir, def.id);

      if (this.skills.has(def.id)) {
        // Only sync autoMessage and parameters, never overwrite user-edited SKILL.md
        const existing = this.skills.get(def.id)!;
        let needsUpdate = false;
        if (existing.autoMessage !== def.autoMessage) {
          existing.autoMessage = def.autoMessage;
          needsUpdate = true;
        }
        const paramsJson = def.parameters ? JSON.stringify(def.parameters) : null;
        const existingParamsJson = existing.parameters ? JSON.stringify(existing.parameters) : null;
        if (existingParamsJson !== paramsJson) {
          existing.parameters = def.parameters;
          needsUpdate = true;
        }
        if (needsUpdate) {
          existing.updatedAt = new Date().toISOString();
          const db = getDatabase();
          db.prepare('UPDATE skills SET auto_message = ?, parameters = ?, updated_at = ? WHERE id = ?')
            .run(def.autoMessage || null, paramsJson, existing.updatedAt, def.id);
          Logger.info(`Updated built-in skill metadata: ${def.name}`);
        }
        continue;
      }

      // Create folder and SKILL.md for built-in skills
      fs.mkdirSync(folderPath, { recursive: true });
      const skillMdPath = path.join(folderPath, 'SKILL.md');
      const frontmatter = `---\nname: ${def.name}\ndescription: ${def.description}\n---\n\n${def.prompt}`;
      fs.writeFileSync(skillMdPath, frontmatter, 'utf-8');

      const skill: Skill = {
        id: def.id,
        name: def.name,
        description: def.description,
        folderPath,
        autoMessage: def.autoMessage,
        parameters: def.parameters,
        enabled: true,
        sourceType: 'builtin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.skills.set(skill.id, skill);
      const db = getDatabase();
      db.prepare(`
        INSERT INTO skills (id, name, description, folder_path, enabled, source_type, auto_message, parameters, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        skill.id, skill.name, skill.description, skill.folderPath,
        1, skill.sourceType, skill.autoMessage || null,
        skill.parameters ? JSON.stringify(skill.parameters) : null,
        skill.createdAt, skill.updatedAt,
      );
      Logger.info(`Created built-in skill: ${def.name}`);
    }
  }
}
