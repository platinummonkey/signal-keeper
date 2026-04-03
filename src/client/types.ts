export type ReviewCategory = 'auto-merge' | 'needs-attention' | 'needs-changes' | 'block';

export interface SuggestedChange {
  file: string;
  description: string;
  suggestion: string;
}

export interface Review {
  id: number;
  pr_id: number;
  head_sha: string;
  category: ReviewCategory;
  summary: string;
  notes: string[];
  suggested_changes: SuggestedChange[];
  confidence: number;
  cost_usd: number | null;
  model: string | null;
  stage: string;
  session_id: string | null;
  created_at: string;
}

export interface Decision {
  id: number;
  pr_id: number;
  action: string;
  note: string | null;
  created_at: string;
}

export interface PR {
  id: number;
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  body: string;
  head_sha: string;
  base_branch: string;
  state: string;
  url: string;
  is_external: number;
  external_stage: string | null;
  pending_approval: number;
  updated_at: string;
  latest_review?: Review | null;
  latest_decision?: Decision | null;
}

export type CIStatus = 'pending' | 'passed' | 'failed' | 'no_runs';

export interface WorkflowRun {
  id: number;
  name: string | null;
  status: string | null;
  conclusion: string | null;
}

export interface CIResponse {
  status: CIStatus;
  runs: WorkflowRun[];
}

export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface DiffResponse {
  diff: string;
  files: DiffFile[];
}

export type AppEvent =
  | { type: 'poll:complete'; pollCount: number; prCount: number }
  | { type: 'review:complete'; prId: number; owner: string; repo: string; number: number; category: ReviewCategory }
  | { type: 'approval:needed'; prId: number; owner: string; repo: string; number: number }
  | { type: 'ci:complete'; prId: number; owner: string; repo: string; number: number; status: string };
