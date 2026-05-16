import { getDatabase } from './connection';

export function runMigrations(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      model TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      tools TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_agent ON chat_messages(agent_id, timestamp);

    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('openai','anthropic','local','custom','qwen','deepseek')),
      api_key TEXT,
      base_url TEXT,
      models TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plugin_configs (
      plugin_id TEXT PRIMARY KEY,
      config TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      prompt TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      source_path TEXT,
      source_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      content TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Mark initial migration as applied
  const insertMigration = db.prepare(
    "INSERT OR IGNORE INTO _migrations (name) VALUES ('initial-schema')"
  );
  insertMigration.run();

  // Migration: expand llm_providers CHECK constraint to include qwen/deepseek
  const migrationName = 'add-qwen-deepseek-provider-types';
  const applied = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migrationName);
  if (!applied) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS llm_providers_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('openai','anthropic','local','custom','qwen','deepseek')),
        api_key TEXT,
        base_url TEXT,
        models TEXT DEFAULT '[]',
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO llm_providers_new SELECT * FROM llm_providers;
      DROP TABLE llm_providers;
      ALTER TABLE llm_providers_new RENAME TO llm_providers;
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migrationName);
  }

  // Migration: add conversations table and conversation_id to chat_messages
  const migration2Name = 'add-conversations';
  const applied2 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration2Name);
  if (!applied2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Conversation',
        agent_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE chat_messages ADD COLUMN conversation_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat_messages(conversation_id, timestamp);
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration2Name);
  }

  // Migration: add daily_reports table
  const migrationReportsName = 'add-daily-reports';
  const appliedReports = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migrationReportsName);
  if (!appliedReports) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        time_range TEXT NOT NULL DEFAULT 'today',
        commits_count INTEGER DEFAULT 0,
        repos_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migrationReportsName);
  }

  // Migration: add enabled_models to llm_providers
  const migration3Name = 'add-enabled-models';
  const applied3 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration3Name);
  if (!applied3) {
    try {
      db.exec(`ALTER TABLE llm_providers ADD COLUMN enabled_models TEXT DEFAULT '[]'`);
    } catch {
      // Column may already exist on fresh installs
    }
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration3Name);
  }

  // Migration: add skills table and skills column on agents
  const migration4Name = 'add-skills';
  const applied4 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration4Name);
  if (!applied4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        prompt TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        source_path TEXT,
        source_type TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    try {
      db.exec(`ALTER TABLE agents ADD COLUMN skills TEXT DEFAULT '[]'`);
    } catch {
      // Column may already exist on fresh installs
    }

    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration4Name);
  }

  // Migration: add local skill source metadata
  const migration5Name = 'add-skill-source-metadata';
  const applied5 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration5Name);
  if (!applied5) {
    try {
      db.exec(`ALTER TABLE skills ADD COLUMN source_path TEXT`);
    } catch {
      // Column may already exist on fresh installs
    }

    try {
      db.exec(`ALTER TABLE skills ADD COLUMN source_type TEXT`);
    } catch {
      // Column may already exist on fresh installs
    }

    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration5Name);
  }

  // Migration: add prompt templates
  const migration6Name = 'add-prompt-templates';
  const applied6 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration6Name);
  if (!applied6) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        content TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration6Name);
  }

  // Migration: add git cache tables for persistent caching
  const migration7Name = 'add-git-cache';
  const applied7 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration7Name);
  if (!applied7) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS git_commits_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL UNIQUE,
        commits TEXT NOT NULL,
        stats TEXT NOT NULL,
        cached_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS git_heatmap_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        heatmap_data TEXT NOT NULL,
        cached_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration7Name);
  }

  // Migration: add tools table for tool management
  const migration8Name = 'add-tools-table';
  const applied8 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration8Name);
  if (!applied8) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        parameters_schema TEXT,
        implementation_type TEXT DEFAULT 'builtin',
        implementation_config TEXT,
        is_enabled INTEGER DEFAULT 1,
        usage_count INTEGER DEFAULT 0,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration8Name);
  }

  // Migration: extend prompt_templates with type, variables, category, tags, usage_count
  const migration9Name = 'extend-prompt-templates';
  const applied9 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration9Name);
  if (!applied9) {
    const addColumn = (col: string, def: string) => {
      try { db.exec(`ALTER TABLE prompt_templates ADD COLUMN ${col} ${def}`); } catch { /* already exists */ }
    };
    addColumn('type', "TEXT NOT NULL DEFAULT 'task'");
    addColumn('variables', "TEXT DEFAULT '[]'");
    addColumn('category', 'TEXT');
    addColumn('tags', "TEXT DEFAULT '[]'");
    addColumn('usage_count', 'INTEGER DEFAULT 0');
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration9Name);
  }
}
