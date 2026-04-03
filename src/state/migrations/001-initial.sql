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
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner, repo, number)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
  head_sha TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('auto-merge','needs-attention','needs-changes','block')),
  summary TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '[]',
  suggested_changes TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  cost_usd REAL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pr_id, head_sha)
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
