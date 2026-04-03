import { fetchPR, fetchPRFiles, fetchPRDiff, getCIStatus, getWorkflowRunsForCommit } from '../github/client.js';
import { upsertPR, insertReview, getPR, type ReviewCategory, type ReviewStage } from '../state/models.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { buildInitialExternalPrompt, buildFinalExternalPrompt } from './external.js';
import { runClaudeReview } from './claude-subprocess.js';
import { validateReviewOutput } from './categorizer.js';
import { logger } from '../utils/logger.js';
import type { ConfigOutput } from '../config/schema.js';
import type { Review } from '../state/models.js';
import type { GithubPR } from '../github/types.js';

export interface ReviewResult {
  review: Review;
  isNewSha: boolean;
}

async function fetchPRData(owner: string, repo: string, number: number): Promise<GithubPR> {
  const ghPR = await fetchPR(owner, repo, number);
  ghPR.files = await fetchPRFiles(owner, repo, number);
  ghPR.diff = await fetchPRDiff(owner, repo, number);
  return ghPR;
}

async function runReview(
  ghPR: GithubPR,
  prompt: string,
  stage: ReviewStage,
  prId: number,
  config: ConfigOutput,
): Promise<Review> {
  const claudeResult = await runClaudeReview(prompt, {
    model: config.reviewModel,
    maxBudgetUsd: config.maxReviewCostUsd,
  });

  const validated = validateReviewOutput(claudeResult.output);

  return insertReview({
    pr_id: prId,
    head_sha: ghPR.headSha,
    category: validated.category as ReviewCategory,
    summary: validated.summary,
    notes: validated.notes,
    suggested_changes: validated.suggestedChanges,
    confidence: validated.confidence,
    cost_usd: claudeResult.costUsd,
    model: claudeResult.model ?? config.reviewModel,
    stage,
  });
}

export async function reviewPR(
  owner: string,
  repo: string,
  number: number,
  config: ConfigOutput,
  customInstruction?: string,
): Promise<ReviewResult> {
  logger.info({ owner, repo, number }, 'Starting PR review');

  const ghPR = await fetchPRData(owner, repo, number);

  const dbPR = upsertPR({
    owner: ghPR.owner,
    repo: ghPR.repo,
    number: ghPR.number,
    title: ghPR.title,
    author: ghPR.author,
    head_sha: ghPR.headSha,
    base_branch: ghPR.baseBranch,
    state: ghPR.state,
    url: ghPR.url,
    created_at: ghPR.createdAt,
    updated_at: ghPR.updatedAt,
    is_external: 0,
    external_stage: null,
  });

  const existingPR = getPR(owner, repo, number);
  const isNewSha = !existingPR || existingPR.head_sha !== ghPR.headSha;

  const prompt = buildReviewPrompt(ghPR, customInstruction);
  const review = await runReview(ghPR, prompt, 'full', dbPR.id, config);

  logger.info({ owner, repo, number, category: review.category }, 'Review complete');
  return { review, isNewSha };
}

export async function reviewExternalInitial(
  owner: string,
  repo: string,
  number: number,
  prId: number,
  config: ConfigOutput,
): Promise<Review> {
  logger.info({ owner, repo, number }, 'Starting external initial review');

  const ghPR = await fetchPRData(owner, repo, number);
  const prompt = buildInitialExternalPrompt(ghPR);
  const review = await runReview(ghPR, prompt, 'initial', prId, config);

  logger.info({ owner, repo, number, category: review.category }, 'External initial review complete');
  return review;
}

export async function reviewExternalFinal(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  prId: number,
  config: ConfigOutput,
): Promise<Review> {
  logger.info({ owner, repo, number }, 'Starting external final review');

  const ghPR = await fetchPRData(owner, repo, number);

  const ciStatus = await getCIStatus(owner, repo, headSha);
  const runs = await getWorkflowRunsForCommit(owner, repo, headSha);
  const failedChecks = runs
    .filter((r) => r.conclusion !== 'success' && r.conclusion !== 'skipped' && r.conclusion !== null)
    .map((r) => r.name ?? 'unknown');

  const prompt = buildFinalExternalPrompt(ghPR, ciStatus, failedChecks);
  const review = await runReview(ghPR, prompt, 'final', prId, config);

  logger.info({ owner, repo, number, category: review.category, ciStatus }, 'External final review complete');
  return review;
}
