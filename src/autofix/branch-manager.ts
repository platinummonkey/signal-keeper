import { run } from '../utils/process.js';
import { logger } from '../utils/logger.js';

export function autofixBranchName(owner: string, repo: string, prNumber: number): string {
  return `autofix/pr-${prNumber}-${Date.now()}`;
}

export async function createBranch(repoDir: string, branchName: string): Promise<void> {
  const result = await run('git', ['-C', repoDir, 'checkout', '-b', branchName]);
  if (result.exitCode !== 0) {
    throw new Error(`git checkout -b ${branchName} failed: ${result.stderr.slice(0, 200)}`);
  }
  logger.debug({ repoDir, branchName }, 'Created autofix branch');
}

/** Stage and commit all changes; returns false if there was nothing to commit. */
export async function commitChanges(repoDir: string, message: string): Promise<boolean> {
  const add = await run('git', ['-C', repoDir, 'add', '-A']);
  if (add.exitCode !== 0) throw new Error(`git add failed: ${add.stderr.slice(0, 200)}`);

  const status = await run('git', ['-C', repoDir, 'status', '--porcelain']);
  if (status.stdout.trim() === '') return false;

  const commit = await run('git', ['-C', repoDir, 'commit', '-m', message]);
  if (commit.exitCode !== 0) throw new Error(`git commit failed: ${commit.stderr.slice(0, 200)}`);
  return true;
}

export async function commitAndPush(
  repoDir: string,
  branchName: string,
  prNumber: number,
): Promise<void> {
  // Stage all changes
  const add = await run('git', ['-C', repoDir, 'add', '-A']);
  if (add.exitCode !== 0) {
    throw new Error(`git add failed: ${add.stderr.slice(0, 200)}`);
  }

  // Check if there's anything to commit
  const status = await run('git', ['-C', repoDir, 'status', '--porcelain']);
  if (status.stdout.trim() === '') {
    throw new Error('Autofix made no changes to commit');
  }

  const commit = await run('git', [
    '-C', repoDir,
    'commit',
    '-m', `autofix: apply AI-suggested changes for PR #${prNumber}`,
  ]);
  if (commit.exitCode !== 0) {
    throw new Error(`git commit failed: ${commit.stderr.slice(0, 200)}`);
  }

  const push = await run('git', ['-C', repoDir, 'push', 'origin', branchName]);
  if (push.exitCode !== 0) {
    throw new Error(`git push failed: ${push.stderr.slice(0, 300)}`);
  }

  logger.info({ repoDir, branchName }, 'Pushed autofix branch');
}
