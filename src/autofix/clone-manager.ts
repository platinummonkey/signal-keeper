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
