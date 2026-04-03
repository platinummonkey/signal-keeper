import { fetchPR, fetchPRFiles, fetchPRDiff, getCIStatus, getWorkflowRunsForCommit } from '../github/client.js';
import { upsertPR, insertReview, getPR, getLatestReview, type ReviewCategory, type ReviewStage } from '../state/models.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { buildInitialExternalPrompt, buildFinalExternalPrompt } from './external.js';
import { runClaudeReview, generatePRComment } from './claude-subprocess.js';
import type { ClaudeCommentResult } from './claude-subprocess.js';
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
  resumeSessionId?: string,
): Promise<Review> {
  const claudeResult = await runClaudeReview(prompt, {
    model: config.reviewModel,
    maxBudgetUsd: config.maxReviewCostUsd,
    resumeSessionId,
    forkSession: !!resumeSessionId, // always fork when resuming so original session stays clean
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
    session_id: claudeResult.sessionId,
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
    owner: ghPR.owner, repo: ghPR.repo, number: ghPR.number,
    title: ghPR.title, author: ghPR.author, body: ghPR.body,
    head_sha: ghPR.headSha, base_branch: ghPR.baseBranch, state: ghPR.state,
    url: ghPR.url, created_at: ghPR.createdAt, updated_at: ghPR.updatedAt,
    is_external: 0, external_stage: null,
  });

  const existingPR = getPR(owner, repo, number);
  const isNewSha = !existingPR || existingPR.head_sha !== ghPR.headSha;

  // Re-review: resume the existing session if available so Claude already has full context
  const existingReview = getLatestReview(dbPR.id);
  const resumeSessionId = existingReview?.session_id ?? undefined;

  const prompt = buildReviewPrompt(ghPR, customInstruction);
  const review = await runReview(ghPR, prompt, 'full', dbPR.id, config, resumeSessionId);

  logger.info({ owner, repo, number, category: review.category, sessionId: review.session_id }, 'Review complete');
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
  logger.info({ owner, repo, number, category: review.category, sessionId: review.session_id }, 'External initial review complete');
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

  // Resume initial review session so Claude still has context of the code
  const initialReview = await import('../state/models.js').then((m) => m.getLatestReviewByStage(prId, 'initial'));
  const resumeSessionId = initialReview?.session_id ?? undefined;

  const prompt = buildFinalExternalPrompt(ghPR, ciStatus, failedChecks);
  const review = await runReview(ghPR, prompt, 'final', prId, config, resumeSessionId);

  logger.info({ owner, repo, number, category: review.category, ciStatus, sessionId: review.session_id }, 'External final review complete');
  return review;
}

export async function generateCommentFromReview(
  prId: number,
  instruction: string,
  config: ConfigOutput,
): Promise<ClaudeCommentResult> {
  const review = getLatestReview(prId);
  if (!review?.session_id) {
    throw new Error('No review session found for this PR — run a review first');
  }

  logger.info({ prId, sessionId: review.session_id }, 'Generating comment from review session');

  return generatePRComment({
    sessionId: review.session_id,
    instruction,
    model: config.reviewModel,
    maxBudgetUsd: config.maxReviewCostUsd * 0.5,
  });
}
