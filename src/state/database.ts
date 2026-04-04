import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS prs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_external INTEGER NOT NULL DEFAULT 0,
  external_stage TEXT,
  pending_approval INTEGER NOT NULL DEFAULT 0,
  UNIQUE(owner, repo, number)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
  head_sha TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('auto-merge','needs-attention','needs-changes','fix-merge','block')),
  summary TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '[]',
  suggested_changes TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  cost_usd REAL,
  model TEXT,
  stage TEXT NOT NULL DEFAULT 'full',
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pr_id, head_sha, stage)
);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('merged','commented','closed','dismissed','re-reviewed')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS autofix_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
  review_id INTEGER REFERENCES reviews(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cloning','running','pushing','done','failed')),
  branch TEXT,
  follow_up_pr_url TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prs_state ON prs(state);
CREATE INDEX IF NOT EXISTS idx_reviews_pr_id ON reviews(pr_id);
CREATE INDEX IF NOT EXISTS idx_decisions_pr_id ON decisions(pr_id);
CREATE INDEX IF NOT EXISTS idx_autofix_jobs_pr_id ON autofix_jobs(pr_id);
`;

// Additive migrations — ALTER TABLE is idempotent via try/catch because
// SQLite errors on duplicate column names.
const MIGRATIONS_V2 = [
  `ALTER TABLE prs ADD COLUMN body TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE prs ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE prs ADD COLUMN external_stage TEXT`,
  `ALTER TABLE reviews ADD COLUMN stage TEXT NOT NULL DEFAULT 'full'`,
  // Re-create reviews unique index to include stage (allows initial+final per sha)
  `DROP INDEX IF EXISTS reviews_pr_id_head_sha_unique`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reviews_pr_id_head_sha_stage ON reviews(pr_id, head_sha, stage)`,
  `ALTER TABLE reviews ADD COLUMN session_id TEXT`,
  `ALTER TABLE prs ADD COLUMN pending_approval INTEGER NOT NULL DEFAULT 0`,
];

let _db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(MIGRATION_SQL);

  for (const sql of MIGRATIONS_V2) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Add fix-merge category: recreate reviews table if the constraint is missing.
  // Use sqlite_master to check idempotently — safe to call on every startup.
  const reviewsSql = (db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='reviews'",
  ).get() as { sql: string } | undefined)?.sql ?? '';

  if (!reviewsSql.includes('fix-merge')) {
    // Disable FK checks during the migration: when SQLite renames a table it
    // auto-updates any other table's FK references to the new name, so
    // DROP TABLE reviews_pre_fixmerge would fail because autofix_jobs still
    // references it. FK=OFF bypasses that check for the duration of the swap.
    db.pragma('foreign_keys = OFF');
    try {
      db.exec(`
        ALTER TABLE reviews RENAME TO reviews_pre_fixmerge;
        CREATE TABLE reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pr_id INTEGER NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
          head_sha TEXT NOT NULL,
          category TEXT NOT NULL CHECK(category IN ('auto-merge','needs-attention','needs-changes','fix-merge','block')),
          summary TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '[]',
          suggested_changes TEXT NOT NULL DEFAULT '[]',
          confidence REAL NOT NULL DEFAULT 0,
          cost_usd REAL,
          model TEXT,
          stage TEXT NOT NULL DEFAULT 'full',
          session_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(pr_id, head_sha, stage)
        );
        INSERT INTO reviews SELECT * FROM reviews_pre_fixmerge;
        DROP TABLE reviews_pre_fixmerge;
      `);
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  _db = db;
  return db;
}

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return _db;
}
