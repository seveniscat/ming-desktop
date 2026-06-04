/**
 * 手动修复 skills 表的 prompt 字段约束
 * 使用方法: npx ts-node scripts/fix-skills-prompt-constraint.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'ming-desktop', 'db.sqlite3');

console.log('Opening database:', dbPath);

const db = new Database(dbPath);

try {
  // Check if migration was already applied
  const applied = db.prepare("SELECT 1 FROM _migrations WHERE name = 'allow-null-skill-prompt'").get();
  
  if (applied) {
    console.log('⚠️  Migration already marked as applied, but may have failed.');
    console.log('Resetting migration flag...');
    db.prepare("DELETE FROM _migrations WHERE name = 'allow-null-skill-prompt'").run();
  }

  // Check current table structure
  const columns = db.prepare("PRAGMA table_info(skills)").all() as any[];
  console.log('Current columns:', columns.map(c => c.name).join(', '));

  const hasFolderPath = columns.some(col => col.name === 'folder_path');
  const hasAutoMessage = columns.some(col => col.name === 'auto_message');
  const hasParameters = columns.some(col => col.name === 'parameters');

  // Build column list based on what exists
  const selectColumns = [
    'id', 'name', 'description', 'prompt', 'enabled',
    'source_path', 'source_type',
    hasFolderPath ? 'folder_path' : "'' as folder_path",
    hasAutoMessage ? 'auto_message' : 'NULL as auto_message',
    hasParameters ? 'parameters' : 'NULL as parameters',
    'created_at', 'updated_at'
  ].join(', ');

  console.log('Executing migration...');

  // Execute migration
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      prompt TEXT,
      enabled INTEGER DEFAULT 1,
      source_path TEXT,
      source_type TEXT,
      folder_path TEXT,
      auto_message TEXT DEFAULT NULL,
      parameters TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO skills_new (id, name, description, prompt, enabled, source_path, source_type, folder_path, auto_message, parameters, created_at, updated_at)
      SELECT ${selectColumns} FROM skills;
    DROP TABLE skills;
    ALTER TABLE skills_new RENAME TO skills;
  `);

  // Mark migration as done
  db.prepare("INSERT INTO _migrations (name) VALUES ('allow-null-skill-prompt')").run();

  // Verify
  const newColumns = db.prepare("PRAGMA table_info(skills)").all() as any[];
  const promptCol = newColumns.find(c => c.name === 'prompt');
  
  console.log('✅ Migration completed successfully!');
  console.log('Prompt column notnull:', promptCol?.notnull === 1 ? 'YES (ERROR!)' : 'NO (Correct)');
  
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
