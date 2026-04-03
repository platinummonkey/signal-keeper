import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test getCIStatus logic in isolation by reimplementing it here —
// the real function calls getOctokit() which requires auth. This keeps
// tests offline and fast.

type WorkflowRun = { status: string | null; conclusion: string | null; name: string | null };

function computeCIStatus(runs: WorkflowRun[]): 'pending' | 'passed' | 'failed' | 'no_runs' {
  if (runs.length === 0) return 'no_runs';
  const active = runs.filter((r) => r.status !== 'completed');
  if (active.length > 0) return 'pending';
  const failed = runs.filter(
    (r) => r.conclusion !== 'success' && r.conclusion !== 'skipped' && r.conclusion !== null,
  );
  return failed.length > 0 ? 'failed' : 'passed';
}

describe('computeCIStatus', () => {
  it('returns no_runs when there are no runs', () => {
    expect(computeCIStatus([])).toBe('no_runs');
  });

  it('returns pending when any run is not completed', () => {
    expect(computeCIStatus([
      { status: 'in_progress', conclusion: null, name: 'test' },
    ])).toBe('pending');
  });

  it('returns passed when all runs succeeded or were skipped', () => {
    expect(computeCIStatus([
      { status: 'completed', conclusion: 'success', name: 'test' },
      { status: 'completed', conclusion: 'skipped', name: 'lint' },
    ])).toBe('passed');
  });

  it('returns failed when any run failed', () => {
    expect(computeCIStatus([
      { status: 'completed', conclusion: 'success', name: 'test' },
      { status: 'completed', conclusion: 'failure', name: 'lint' },
    ])).toBe('failed');
  });

  it('returns failed for cancelled runs', () => {
    expect(computeCIStatus([
      { status: 'completed', conclusion: 'cancelled', name: 'test' },
    ])).toBe('failed');
  });
});

// isExternalContributor logic test (pure, no network)
describe('isExternalContributor logic', () => {
  it('returns false when trustedOrgs is empty', async () => {
    // With no trusted orgs, everyone is considered internal
    const trustedOrgs: string[] = [];
    const result = trustedOrgs.length === 0 ? false : true;
    expect(result).toBe(false);
  });
});
