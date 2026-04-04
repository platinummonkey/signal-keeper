import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
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
    // Prune stale worktrees left behind by crashed fix sessions
    await run('git', ['-C', repoDir, 'worktree', 'prune']);
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
 * Fetch the PR's head commit into the main clone without checking it out.
 * Works for both same-repo and fork PRs via the pull/<N>/head ref.
 */
export async function fetchPRHead(
  repoDir: string,
  prNumber: number,
  headSha: string,
): Promise<void> {
  const fetch = await run('git', ['-C', repoDir, 'fetch', 'origin', `pull/${prNumber}/head`]);
  if (fetch.exitCode !== 0) {
    const fetchSha = await run('git', ['-C', repoDir, 'fetch', 'origin', headSha]);
    if (fetchSha.exitCode !== 0) {
      throw new Error(`Could not fetch PR #${prNumber} head: ${fetch.stderr.slice(0, 200)}`);
    }
  }
  logger.debug({ repoDir, prNumber, headSha }, 'Fetched PR head');
}

/**
 * Create an isolated git worktree at `worktreePath` checked out at `ref`.
 * Each fix session gets its own worktree so concurrent fixes on the same
 * repo never conflict.
 */
export async function createWorktree(
  repoDir: string,
  worktreePath: string,
  ref: string,
): Promise<void> {
  mkdirSync(dirname(worktreePath), { recursive: true });
  const result = await run('git', [
    '-C', repoDir,
    'worktree', 'add',
    '--detach',
    worktreePath,
    ref,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${result.stderr.slice(0, 300)}`);
  }
  logger.debug({ repoDir, worktreePath, ref }, 'Created worktree');
}

/**
 * Remove a worktree and its directory.  Called in a finally block so it runs
 * even if the fix fails.  Errors are logged but not re-thrown.
 */
export async function removeWorktree(repoDir: string, worktreePath: string): Promise<void> {
  const result = await run('git', ['-C', repoDir, 'worktree', 'remove', '--force', worktreePath]);
  if (result.exitCode !== 0) {
    logger.warn({ repoDir, worktreePath, stderr: result.stderr }, 'git worktree remove failed');
  } else {
    logger.debug({ repoDir, worktreePath }, 'Removed worktree');
  }
}

/** @deprecated Use fetchPRHead + createWorktree instead */
export async function checkoutPRHead(
  repoDir: string,
  prNumber: number,
  headSha: string,
): Promise<void> {
  await fetchPRHead(repoDir, prNumber, headSha);
  const checkout = await run('git', ['-C', repoDir, 'checkout', headSha]);
  if (checkout.exitCode !== 0) {
    throw new Error(`git checkout ${headSha} failed: ${checkout.stderr.slice(0, 200)}`);
  }
}

export async function checkoutBranch(repoDir: string, baseBranch: string): Promise<void> {
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
