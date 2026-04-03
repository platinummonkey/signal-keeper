import { ensureRepo, checkoutBranch } from './clone-manager.js';
import { autofixBranchName, createBranch, commitAndPush } from './branch-manager.js';
import { runClaudeFix } from './fix-runner.js';
import { createAutofixPR } from './pr-creator.js';
import { createAutofixJob, updateAutofixJob, getLatestReview } from '../state/models.js';
import { logger } from '../utils/logger.js';
import type { PRWithReview } from '../state/models.js';
import type { ConfigOutput } from '../config/schema.js';

export interface AutofixResult {
  followUpPrUrl: string | null;
  branchName: string;
}

export async function runAutofix(pr: PRWithReview, config: ConfigOutput): Promise<AutofixResult> {
  const review = getLatestReview(pr.id);
  if (!review) {
    throw new Error('No review found for this PR — run a review first');
  }

  const job = createAutofixJob({ pr_id: pr.id, review_id: review.id });

  try {
    updateAutofixJob(job.id, { status: 'cloning' });
    const repoDir = await ensureRepo(config.workDir, pr.owner, pr.repo);
    await checkoutBranch(repoDir, pr.base_branch);

    const branchName = autofixBranchName(pr.owner, pr.repo, pr.number);
    await createBranch(repoDir, branchName);
    updateAutofixJob(job.id, { status: 'running', branch: branchName });

    await runClaudeFix(repoDir, review, {
      model: config.reviewModel,
      maxBudgetUsd: config.maxReviewCostUsd * 2,
    });

    updateAutofixJob(job.id, { status: 'pushing' });
    await commitAndPush(repoDir, branchName, pr.number);

    const followUpPrUrl = await createAutofixPR({
      owner: pr.owner,
      repo: pr.repo,
      sourcePrNumber: pr.number,
      sourcePrTitle: pr.title,
      branchName,
      baseBranch: pr.base_branch,
      review,
    });

    updateAutofixJob(job.id, { status: 'done', follow_up_pr_url: followUpPrUrl });
    logger.info({ prNumber: pr.number, followUpPrUrl }, 'Autofix complete');

    return { followUpPrUrl, branchName };
  } catch (err) {
    const message = (err as Error).message;
    updateAutofixJob(job.id, { status: 'failed', error: message });
    throw err;
  }
}
