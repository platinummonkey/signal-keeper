import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const migrationSql = readFileSync(
    join(__dirname, 'migrations', '001-initial.sql'),
    'utf8',
  );
  db.exec(migrationSql);

  _db = db;
  return db;
}

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return _db;
}
