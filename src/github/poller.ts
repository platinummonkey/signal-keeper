import { getOctokit, getTeamMembers } from './client.js';
import { logger } from '../utils/logger.js';
import type { Target, OrgTarget, RepoTarget } from '../config/types.js';
import type { GithubPR } from './types.js';

function isOrgTarget(t: Target): t is OrgTarget {
  return 'org' in t;
}

async function applyFilter(
  prs: GithubPR[],
  filter: string,
  org?: string,
  team?: string,
): Promise<GithubPR[]> {
  if (filter === 'all') return prs;

  if (filter === 'team' && org && team) {
    const members = await getTeamMembers(org, team);
    return prs.filter((pr) => members.has(pr.author));
  }

  if (filter === 'assigned') {
    // 'assigned' means PRs assigned to the authenticated user — not easily determined
    // at this layer without the current user; return all and let the user configure 'author' instead
    logger.warn('filter=assigned is not yet fully implemented; returning all PRs');
    return prs;
  }

  if (filter === 'author') {
    // author filter is not configurable here without a username in config; return all
    logger.warn('filter=author requires a username config field; returning all PRs');
    return prs;
  }

  return prs;
}

async function pollRepo(
  owner: string,
  repo: string,
  filter: string,
  teamContext?: { org: string; team: string },
): Promise<GithubPR[]> {
  const octokit = getOctokit();
  const prs: GithubPR[] = [];

  try {
    for await (const response of octokit.paginate.iterator(
      octokit.pulls.list,
      { owner, repo, state: 'open', per_page: 50 },
    )) {
      for (const pr of response.data) {
        if (pr.draft) continue;
        prs.push({
          owner,
          repo,
          number: pr.number,
          title: pr.title,
          author: pr.user?.login ?? 'unknown',
          headSha: pr.head.sha,
          baseBranch: pr.base.ref,
          state: 'open',
          url: pr.html_url,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          isDraft: false,
        });
      }
    }
  } catch (err) {
    logger.warn({ owner, repo, err }, 'Failed to poll repo');
  }

  return applyFilter(prs, filter, teamContext?.org, teamContext?.team);
}

async function pollOrg(org: string, filter: string, team?: string): Promise<GithubPR[]> {
  const octokit = getOctokit();
  const prs: GithubPR[] = [];

  try {
    for await (const response of octokit.paginate.iterator(
      octokit.repos.listForOrg,
      { org, type: 'all', per_page: 100 },
    )) {
      for (const repo of response.data) {
        if (repo.archived) continue;
        const repoPRs = await pollRepo(
          org,
          repo.name,
          filter,
          filter === 'team' && team ? { org, team } : undefined,
        );
        prs.push(...repoPRs);
      }
    }
  } catch (err) {
    logger.warn({ org, err }, 'Failed to poll org');
  }

  return prs;
}

export async function pollTarget(target: Target): Promise<GithubPR[]> {
  if (isOrgTarget(target)) {
    logger.debug({ org: target.org, filter: target.filter }, 'Polling org');
    return pollOrg(target.org, target.filter, target.team);
  } else {
    const [owner, repo] = (target as RepoTarget).repo.split('/');
    logger.debug({ owner, repo, filter: target.filter }, 'Polling repo');
    return pollRepo(owner, repo, target.filter);
  }
}

export async function pollAllTargets(targets: Target[]): Promise<GithubPR[]> {
  const results = await Promise.allSettled(targets.map(pollTarget));
  const prs: GithubPR[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      prs.push(...result.value);
    } else {
      logger.warn({ err: result.reason }, 'Target poll failed');
    }
  }

  // Deduplicate by owner/repo/number
  const seen = new Set<string>();
  return prs.filter((pr) => {
    const key = `${pr.owner}/${pr.repo}#${pr.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
