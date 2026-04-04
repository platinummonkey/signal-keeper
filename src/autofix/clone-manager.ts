import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { run } from '../utils/process.js';
import { logger } from '../utils/logger.js';

export async function ensureRepo(workDir: string, owner: string, repo: string): Promise<string> {
  const repoDir = join(workDir, owner, repo);
  mkdirSync(join(workDir, owner), { recursive: true });

  if (existsSync(join(repoDir, '.git'))) {
    logger.debug({ repoDir }, 'Repo exists — fetching');
    const fetch = await run('git', ['-C', repoDir, 'fetch', '--all', '--prune']);
    if (fetch.exitCode !== 0) {
      logger.warn({ stderr: fetch.stderr }, 'git fetch failed, continuing with existing state');
    }
  } else {
    logger.info({ owner, repo, repoDir }, 'Cloning repo');
    const clone = await run('git', [
      'clone',
      `https://github.com/${owner}/${repo}.git`,
      repoDir,
    ]);
    if (clone.exitCode !== 0) {
      throw new Error(`git clone failed: ${clone.stderr.slice(0, 300)}`);
    }
  }

  return repoDir;
}

/**
 * Fetch and checkout the exact HEAD commit of a PR.
 * Uses pull/<N>/head which works for both same-repo and fork PRs.
 * Leaves the repo in detached-HEAD state at the PR's tip commit.
 */
export async function checkoutPRHead(
  repoDir: string,
  prNumber: number,
  headSha: string,
): Promise<void> {
  // fetch pull/<N>/head — resolves even for fork PRs
  const fetch = await run('git', ['-C', repoDir, 'fetch', 'origin', `pull/${prNumber}/head`]);
  if (fetch.exitCode !== 0) {
    // Fallback: fetch the SHA directly (works when origin owns the branch)
    const fetchSha = await run('git', ['-C', repoDir, 'fetch', 'origin', headSha]);
    if (fetchSha.exitCode !== 0) {
      throw new Error(`Could not fetch PR #${prNumber} head: ${fetch.stderr.slice(0, 200)}`);
    }
  }
  const checkout = await run('git', ['-C', repoDir, 'checkout', headSha]);
  if (checkout.exitCode !== 0) {
    throw new Error(`git checkout ${headSha} failed: ${checkout.stderr.slice(0, 200)}`);
  }
  logger.debug({ repoDir, prNumber, headSha }, 'Checked out PR head');
}

export async function checkoutBranch(repoDir: string, baseBranch: string): Promise<void> {
  // Reset any local changes and checkout the base branch
  const reset = await run('git', ['-C', repoDir, 'checkout', baseBranch]);
  if (reset.exitCode !== 0) {
    throw new Error(`git checkout ${baseBranch} failed: ${reset.stderr.slice(0, 200)}`);
  }

  const pull = await run('git', ['-C', repoDir, 'pull', '--ff-only']);
  if (pull.exitCode !== 0) {
    logger.warn({ repoDir, baseBranch }, 'git pull --ff-only failed, resetting to origin');
    await run('git', ['-C', repoDir, 'reset', '--hard', `origin/${baseBranch}`]);
  }
}
