import { Octokit } from '@octokit/rest';
import { run } from '../utils/process.js';
import { logger } from '../utils/logger.js';
import type { GithubPR, GithubFile } from './types.js';

let _octokit: Octokit | null = null;

export async function getToken(tokenCommand: string): Promise<string> {
  const parts = tokenCommand.trim().split(/\s+/);
  const { stdout, exitCode, stderr } = await run(parts[0], parts.slice(1));
  if (exitCode !== 0) {
    throw new Error(`Token command failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return stdout.trim();
}

export async function initOctokit(tokenCommand: string): Promise<Octokit> {
  const token = await getToken(tokenCommand);
  _octokit = new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        logger.warn({ url: options.url, retryAfter, retryCount }, 'GitHub rate limit hit — retrying');
        return retryCount < 3;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
        logger.warn({ url: options.url, retryAfter }, 'GitHub secondary rate limit hit — skipping');
        return false;
      },
    },
  });
  return _octokit;
}

export async function getTeamMembers(org: string, team: string): Promise<Set<string>> {
  const octokit = getOctokit();
  const members = new Set<string>();
  try {
    for await (const response of octokit.paginate.iterator(
      octokit.teams.listMembersInOrg,
      { org, team_slug: team, per_page: 100 },
    )) {
      for (const m of response.data) {
        members.add(m.login);
      }
    }
  } catch (err) {
    logger.warn({ org, team, err }, 'Failed to fetch team members');
  }
  return members;
}

export function getOctokit(): Octokit {
  if (!_octokit) {
    throw new Error('Octokit not initialized — call initOctokit() first');
  }
  return _octokit;
}

export async function fetchPR(owner: string, repo: string, number: number): Promise<GithubPR> {
  const octokit = getOctokit();
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: number });

  return {
    owner,
    repo,
    number: data.number,
    title: data.title,
    author: data.user?.login ?? 'unknown',
    headSha: data.head.sha,
    baseBranch: data.base.ref,
    state: data.merged ? 'merged' : (data.state as 'open' | 'closed'),
    url: data.html_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isDraft: data.draft ?? false,
  };
}

export async function fetchPRFiles(owner: string, repo: string, number: number): Promise<GithubFile[]> {
  const octokit = getOctokit();
  const files: GithubFile[] = [];

  for await (const response of octokit.paginate.iterator(
    octokit.pulls.listFiles,
    { owner, repo, pull_number: number, per_page: 100 },
  )) {
    for (const f of response.data) {
      files.push({
        filename: f.filename,
        status: f.status as GithubFile['status'],
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      });
    }
  }
  return files;
}

export async function fetchPRDiff(owner: string, repo: string, number: number): Promise<string> {
  const octokit = getOctokit();
  const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: number,
    headers: { accept: 'application/vnd.github.v3.diff' },
  });
  return response.data as unknown as string;
}

export async function createComment(
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<void> {
  await getOctokit().issues.createComment({ owner, repo, issue_number: number, body });
  logger.info({ owner, repo, number }, 'Posted comment on PR');
}

export async function mergePR(
  owner: string,
  repo: string,
  number: number,
  sha: string,
): Promise<void> {
  await getOctokit().pulls.merge({
    owner,
    repo,
    pull_number: number,
    sha,
    merge_method: 'squash',
  });
  logger.info({ owner, repo, number }, 'Merged PR');
}

export async function closePR(owner: string, repo: string, number: number): Promise<void> {
  await getOctokit().pulls.update({ owner, repo, pull_number: number, state: 'closed' });
  logger.info({ owner, repo, number }, 'Closed PR');
}
