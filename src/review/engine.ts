import { fetchPR, fetchPRFiles, fetchPRDiff } from '../github/client.js';
import { upsertPR, upsertReview, getPR, type ReviewCategory } from '../state/models.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { runClaudeReview } from './claude-subprocess.js';
import { validateReviewOutput } from './categorizer.js';
import { logger } from '../utils/logger.js';
import type { ConfigOutput } from '../config/schema.js';
import type { Review } from '../state/models.js';

export interface ReviewResult {
  review: Review;
  isNewSha: boolean;
}

export async function reviewPR(
  owner: string,
  repo: string,
  number: number,
  config: ConfigOutput,
  customInstruction?: string,
): Promise<ReviewResult> {
  logger.info({ owner, repo, number }, 'Starting PR review');

  // Fetch PR data
  const ghPR = await fetchPR(owner, repo, number);
  const files = await fetchPRFiles(owner, repo, number);
  const diff = await fetchPRDiff(owner, repo, number);

  ghPR.files = files;
  ghPR.diff = diff;

  // Upsert PR in DB
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
  });

  // Check if we already have a review for this SHA
  const existingPR = getPR(owner, repo, number);
  const isNewSha = !existingPR || existingPR.head_sha !== ghPR.headSha;

  // Build and run review
  const prompt = buildReviewPrompt(ghPR, customInstruction);

  const claudeResult = await runClaudeReview(prompt, {
    model: config.reviewModel,
    maxBudgetUsd: config.maxReviewCostUsd,
  });

  const validatedOutput = validateReviewOutput(claudeResult.output);

  const review = upsertReview({
    pr_id: dbPR.id,
    head_sha: ghPR.headSha,
    category: validatedOutput.category as ReviewCategory,
    summary: validatedOutput.summary,
    notes: validatedOutput.notes,
    suggested_changes: validatedOutput.suggestedChanges,
    confidence: validatedOutput.confidence,
    cost_usd: claudeResult.costUsd,
    model: claudeResult.model ?? config.reviewModel,
  });

  logger.info(
    { owner, repo, number, category: review.category, confidence: review.confidence },
    'Review complete',
  );

  return { review, isNewSha };
}
