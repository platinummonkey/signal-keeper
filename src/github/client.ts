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
    const status = (err as { status?: number }).status;
    if (status === 404) {
      logger.debug({ org, team }, 'Team not found (404)');
    } else {
      logger.warn({ org, team, err }, 'Failed to fetch team members');
    }
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
    body: data.body ?? '',
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

// --- Org membership (cached) ---

interface CacheEntry { isMember: boolean; expiresAt: number }
const _membershipCache = new Map<string, CacheEntry>();
const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;

export async function isOrgMember(org: string, username: string): Promise<boolean> {
  const key = `${org}:${username}`;
  const cached = _membershipCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.isMember;

  let isMember = false;
  try {
    await getOctokit().orgs.checkMembershipForUser({ org, username });
    isMember = true; // 204 = member; anything else throws
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    // 404 = not a member or org doesn't exist; both mean non-member for our purposes
    if (status !== 404) {
      logger.warn({ org, username, err }, 'Org membership check failed — assuming non-member');
    }
    isMember = false;
  }

  _membershipCache.set(key, { isMember, expiresAt: Date.now() + MEMBERSHIP_TTL_MS });
  return isMember;
}

export async function isExternalContributor(username: string, trustedOrgs: string[]): Promise<boolean> {
  if (trustedOrgs.length === 0) return false;
  const results = await Promise.all(trustedOrgs.map((org) => isOrgMember(org, username)));
  return !results.some(Boolean);
}

// --- Workflow runs ---

export interface WorkflowJob {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
}

export interface WorkflowRun {
  id: number;
  status: string | null;
  conclusion: string | null;
  name: string | null;
  jobs?: WorkflowJob[];
}

export type CIStatus = 'pending' | 'passed' | 'failed' | 'no_runs';

export async function getWorkflowRunsForCommit(
  owner: string,
  repo: string,
  headSha: string,
): Promise<WorkflowRun[]> {
  try {
    const { data } = await getOctokit().actions.listWorkflowRunsForRepo({
      owner, repo, head_sha: headSha, per_page: 30,
    });
    return data.workflow_runs.map((r) => ({
      id: r.id,
      status: r.status,
      conclusion: r.conclusion ?? null,
      name: r.name ?? null,
    }));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      logger.debug({ owner, repo }, 'No workflow runs found (404) — Actions may not be enabled');
    } else {
      logger.warn({ owner, repo, headSha, err }, 'Failed to fetch workflow runs');
    }
    return [];
  }
}

export async function approveWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
  await getOctokit().actions.approveWorkflowRun({ owner, repo, run_id: runId });
  logger.info({ owner, repo, runId }, 'Approved workflow run');
}

/** Returns the PR's head branch name and whether it comes from a fork. */
export async function getPRHeadInfo(
  owner: string,
  repo: string,
  number: number,
): Promise<{ headBranch: string; isFork: boolean }> {
  const { data } = await getOctokit().pulls.get({ owner, repo, pull_number: number });
  return {
    headBranch: data.head.ref,
    isFork: data.head.repo?.full_name !== `${owner}/${repo}`,
  };
}

export async function getWorkflowRunJobs(
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowJob[]> {
  try {
    const { data } = await getOctokit().actions.listJobsForWorkflowRun({
      owner, repo, run_id: runId, per_page: 100,
    });
    return data.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion ?? null,
    }));
  } catch (err) {
    logger.debug({ owner, repo, runId, err }, 'Failed to fetch jobs for run');
    return [];
  }
}

async function getActionRequiredRuns(
  owner: string,
  repo: string,
  headSha: string,
): Promise<WorkflowRun[]> {
  try {
    // Query explicitly for action_required status — more reliable than filtering
    // the full run list client-side, especially for new contributors' first PRs.
    // 'action_required' is a valid GitHub status but not in Octokit's narrowed type
    const { data } = await getOctokit().request('GET /repos/{owner}/{repo}/actions/runs', {
      owner, repo, head_sha: headSha, status: 'action_required', per_page: 50,
    }) as { data: { workflow_runs: Array<{ id: number; status: string | null; conclusion: string | null; name: string | null }> } };
    return data.workflow_runs.map((r) => ({
      id: r.id,
      status: r.status,
      conclusion: r.conclusion ?? null,
      name: r.name ?? null,
    }));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      logger.debug({ owner, repo }, 'No action_required runs (404)');
    } else {
      logger.warn({ owner, repo, headSha, err }, 'Failed to query action_required runs');
    }
    return [];
  }
}

export async function hasActionRequiredRuns(
  owner: string,
  repo: string,
  headSha: string,
): Promise<boolean> {
  const runs = await getActionRequiredRuns(owner, repo, headSha);
  return runs.length > 0;
}

export async function approveAllActionRequiredRuns(
  owner: string,
  repo: string,
  headSha: string,
): Promise<number> {
  const pending = await getActionRequiredRuns(owner, repo, headSha);
  await Promise.all(pending.map((r) => approveWorkflowRun(owner, repo, r.id)));
  logger.info({ owner, repo, headSha, count: pending.length }, 'Approved action_required workflow runs');
  return pending.length;
}

export async function getCIStatus(
  owner: string,
  repo: string,
  headSha: string,
): Promise<CIStatus> {
  const runs = await getWorkflowRunsForCommit(owner, repo, headSha);
  if (runs.length === 0) return 'no_runs';

  const active = runs.filter((r) => r.status !== 'completed');
  if (active.length > 0) return 'pending';

  const failed = runs.filter((r) => r.conclusion !== 'success' && r.conclusion !== 'skipped' && r.conclusion !== null);
  return failed.length > 0 ? 'failed' : 'passed';
}
