import { getDatabase } from '../database/connection';
import { randomUUID } from 'crypto';

export interface MemoryRecord {
  id: string;
  content: string;
  category: 'profile' | 'preference' | 'context' | 'custom';
  source: 'manual' | 'agent_suggested';
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export class MemoryManager {
  list(filters?: { category?: string; source?: string; status?: string; search?: string }): MemoryRecord[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params: any[] = [];

    if (filters?.status && filters.status !== 'all') { sql += ' AND status = ?'; params.push(filters.status); }
    else if (!filters?.status) { sql += " AND status = 'active'"; }

    if (filters?.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters?.source) { sql += ' AND source = ?'; params.push(filters.source); }
    if (filters?.search) { sql += ' AND content LIKE ?'; params.push(`%${filters.search}%`); }

    sql += ' ORDER BY category, updated_at DESC';
    return db.prepare(sql).all(...params) as MemoryRecord[];
  }

  get(id: string): MemoryRecord | undefined {
    return getDatabase().prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRecord | undefined;
  }

  create(data: { content: string; category: string; source?: string }): MemoryRecord {
    const db = getDatabase();
    const id = randomUUID();
    const source = data.source || 'manual';
    db.prepare(`
      INSERT INTO memories (id, content, category, source, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(id, data.content, data.category, source);
    return this.get(id)!;
  }

  update(id: string, data: { content?: string; category?: string; status?: string }): MemoryRecord | undefined {
    const db = getDatabase();
    const sets: string[] = [];
    const params: any[] = [];

    if (data.content !== undefined) { sets.push('content = ?'); params.push(data.content); }
    if (data.category !== undefined) { sets.push('category = ?'); params.push(data.category); }
    if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }

    if (sets.length === 0) return this.get(id);

    sets.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  delete(id: string): void {
    getDatabase().prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  getActiveMemories(): MemoryRecord[] {
    return this.list({ status: 'active' });
  }

  formatMemoriesForPrompt(): string {
    const memories = this.getActiveMemories();
    if (memories.length === 0) return '';

    const order = ['profile', 'preference', 'context', 'custom'];
    const sorted = [...memories].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

    const lines = sorted.map(m => `- [${m.category}] ${m.content}`).join('\n');
    return `\n## User Memories\n\nThe following are facts and preferences you should remember about the user:\n\n${lines}\n`;
  }

  estimateTokens(): number {
    const text = this.formatMemoriesForPrompt();
    return Math.ceil(text.length / 4);
  }
}
