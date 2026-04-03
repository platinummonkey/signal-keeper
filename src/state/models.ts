import { getDb } from './database.js';

export type ReviewCategory = 'auto-merge' | 'needs-attention' | 'needs-changes' | 'block';
export type DecisionAction = 'merged' | 'commented' | 'closed' | 'dismissed' | 're-reviewed';
export type AutofixStatus = 'pending' | 'cloning' | 'running' | 'pushing' | 'done' | 'failed';
export type ExternalStage = 'awaiting_approval' | 'ci_pending' | 'complete';
export type ReviewStage = 'full' | 'initial' | 'final';

export interface PR {
  id: number;
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  head_sha: string;
  base_branch: string;
  state: string;
  url: string;
  created_at: string;
  updated_at: string;
  discovered_at: string;
  is_external: number;       // 0 | 1
  external_stage: ExternalStage | null;
}

export interface Review {
  id: number;
  pr_id: number;
  head_sha: string;
  category: ReviewCategory;
  summary: string;
  notes: string[];
  suggested_changes: Array<{ file: string; description: string; suggestion: string }>;
  confidence: number;
  cost_usd: number | null;
  model: string | null;
  stage: ReviewStage;
  created_at: string;
}

export interface Decision {
  id: number;
  pr_id: number;
  action: DecisionAction;
  note: string | null;
  created_at: string;
}

export interface AutofixJob {
  id: number;
  pr_id: number;
  review_id: number | null;
  status: AutofixStatus;
  branch: string | null;
  follow_up_pr_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// PR queries
export function upsertPR(data: Omit<PR, 'id' | 'discovered_at'>): PR {
  const db = getDb();
  return db.prepare(`
    INSERT INTO prs (owner, repo, number, title, author, head_sha, base_branch, state, url, created_at, updated_at, is_external, external_stage)
    VALUES (@owner, @repo, @number, @title, @author, @head_sha, @base_branch, @state, @url, @created_at, @updated_at, @is_external, @external_stage)
    ON CONFLICT(owner, repo, number) DO UPDATE SET
      title = excluded.title,
      head_sha = excluded.head_sha,
      state = excluded.state,
      updated_at = excluded.updated_at,
      is_external = excluded.is_external
      -- external_stage is intentionally NOT updated here; use setExternalStage()
    RETURNING *
  `).get(Object.assign({ is_external: 0, external_stage: null }, data)) as PR;
}

export function setExternalStage(prId: number, stage: ExternalStage | null): void {
  getDb().prepare('UPDATE prs SET external_stage = ? WHERE id = ?').run(stage, prId);
}

export function listExternalPRsAwaitingCi(): PR[] {
  return getDb().prepare(
    "SELECT * FROM prs WHERE state = 'open' AND is_external = 1 AND external_stage = 'ci_pending'",
  ).all() as PR[];
}

export function getPR(owner: string, repo: string, number: number): PR | undefined {
  return getDb().prepare(
    'SELECT * FROM prs WHERE owner = ? AND repo = ? AND number = ?',
  ).get(owner, repo, number) as PR | undefined;
}

export function listOpenPRs(): Array<PR & { latest_review?: Review }> {
  const db = getDb();
  const prs = db.prepare("SELECT * FROM prs WHERE state = 'open' ORDER BY updated_at DESC").all() as PR[];

  return prs.map((pr) => {
    const review = db.prepare(
      'SELECT * FROM reviews WHERE pr_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get(pr.id) as Review | undefined;

    if (review) {
      return {
        ...pr,
        latest_review: {
          ...review,
          notes: JSON.parse(review.notes as unknown as string),
          suggested_changes: JSON.parse(review.suggested_changes as unknown as string),
        },
      };
    }
    return pr;
  });
}

export function markPRClosed(owner: string, repo: string, number: number): void {
  getDb().prepare(
    "UPDATE prs SET state = 'closed' WHERE owner = ? AND repo = ? AND number = ?",
  ).run(owner, repo, number);
}

// Review queries
export function upsertReview(data: {
  pr_id: number;
  head_sha: string;
  category: ReviewCategory;
  summary: string;
  notes: string[];
  suggested_changes: Array<{ file: string; description: string; suggestion: string }>;
  confidence: number;
  cost_usd?: number;
  model?: string;
  stage?: ReviewStage;
}): Review {
  const db = getDb();
  const row = db.prepare(`
    INSERT INTO reviews (pr_id, head_sha, category, summary, notes, suggested_changes, confidence, cost_usd, model, stage)
    VALUES (@pr_id, @head_sha, @category, @summary, @notes, @suggested_changes, @confidence, @cost_usd, @model, @stage)
    ON CONFLICT(pr_id, head_sha, stage) DO UPDATE SET
      category = excluded.category,
      summary = excluded.summary,
      notes = excluded.notes,
      suggested_changes = excluded.suggested_changes,
      confidence = excluded.confidence,
      cost_usd = excluded.cost_usd,
      model = excluded.model,
      stage = excluded.stage
    RETURNING *
  `).get({
    stage: 'full',
    ...data,
    notes: JSON.stringify(data.notes),
    suggested_changes: JSON.stringify(data.suggested_changes),
    cost_usd: data.cost_usd ?? null,
    model: data.model ?? null,
  }) as Review & { notes: string; suggested_changes: string };
  return parseReviewRow(row);
}

function parseReviewRow(row: Review & { notes: string; suggested_changes: string }): Review {
  return { ...row, notes: JSON.parse(row.notes), suggested_changes: JSON.parse(row.suggested_changes) };
}

export function getLatestReview(prId: number): Review | undefined {
  const row = getDb().prepare(
    'SELECT * FROM reviews WHERE pr_id = ? ORDER BY created_at DESC LIMIT 1',
  ).get(prId) as (Review & { notes: string; suggested_changes: string }) | undefined;
  return row ? parseReviewRow(row) : undefined;
}

export function getLatestReviewByStage(prId: number, stage: ReviewStage): Review | undefined {
  const row = getDb().prepare(
    'SELECT * FROM reviews WHERE pr_id = ? AND stage = ? ORDER BY created_at DESC LIMIT 1',
  ).get(prId, stage) as (Review & { notes: string; suggested_changes: string }) | undefined;
  return row ? parseReviewRow(row) : undefined;
}

export function insertReview(data: {
  pr_id: number;
  head_sha: string;
  category: ReviewCategory;
  summary: string;
  notes: string[];
  suggested_changes: Array<{ file: string; description: string; suggestion: string }>;
  confidence: number;
  cost_usd?: number;
  model?: string;
  stage: ReviewStage;
}): Review {
  const db = getDb();
  const row = db.prepare(`
    INSERT INTO reviews (pr_id, head_sha, category, summary, notes, suggested_changes, confidence, cost_usd, model, stage)
    VALUES (@pr_id, @head_sha, @category, @summary, @notes, @suggested_changes, @confidence, @cost_usd, @model, @stage)
    RETURNING *
  `).get({
    ...data,
    notes: JSON.stringify(data.notes),
    suggested_changes: JSON.stringify(data.suggested_changes),
    cost_usd: data.cost_usd ?? null,
    model: data.model ?? null,
  }) as Review & { notes: string; suggested_changes: string };
  return parseReviewRow(row);
}

// Decision queries
export function recordDecision(data: { pr_id: number; action: DecisionAction; note?: string }): Decision {
  return getDb().prepare(`
    INSERT INTO decisions (pr_id, action, note)
    VALUES (@pr_id, @action, @note)
    RETURNING *
  `).get({ note: null, ...data }) as Decision;
}

export function getLatestDecision(prId: number): Decision | undefined {
  return getDb().prepare(
    'SELECT * FROM decisions WHERE pr_id = ? ORDER BY id DESC LIMIT 1',
  ).get(prId) as Decision | undefined;
}

// Autofix queries
export function createAutofixJob(data: { pr_id: number; review_id?: number }): AutofixJob {
  return getDb().prepare(`
    INSERT INTO autofix_jobs (pr_id, review_id)
    VALUES (@pr_id, @review_id)
    RETURNING *
  `).get({ review_id: null, ...data }) as AutofixJob;
}

export function updateAutofixJob(
  id: number,
  data: Partial<Pick<AutofixJob, 'status' | 'branch' | 'follow_up_pr_url' | 'error'>>,
): void {
  const sets = Object.keys(data)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  getDb().prepare(
    `UPDATE autofix_jobs SET ${sets}, updated_at = datetime('now') WHERE id = @id`,
  ).run({ id, ...data });
}
