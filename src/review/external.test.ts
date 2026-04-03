import { describe, it, expect } from 'vitest';
import { buildInitialExternalPrompt, buildFinalExternalPrompt } from './external.js';
import type { GithubPR } from '../github/types.js';

const BASE_PR: GithubPR = {
  owner: 'acme', repo: 'oss', number: 7,
  title: 'Add feature', author: 'external-user', body: 'This adds a great feature.',
  headSha: 'sha1', baseBranch: 'main',
  state: 'open', url: 'https://github.com/acme/oss/pull/7',
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  isDraft: false,
};

describe('buildInitialExternalPrompt', () => {
  it('identifies the PR as from an external contributor', () => {
    const prompt = buildInitialExternalPrompt(BASE_PR);
    expect(prompt).toContain('external contributor');
    expect(prompt).toContain('external-user');
  });

  it('instructs reviewer not to make a final merge decision', () => {
    const prompt = buildInitialExternalPrompt(BASE_PR);
    expect(prompt).toContain('preliminary');
    expect(prompt.toLowerCase()).toContain('ci');
  });

  it('includes malicious intent check', () => {
    const prompt = buildInitialExternalPrompt(BASE_PR);
    expect(prompt.toLowerCase()).toContain('malicious');
  });
});

describe('buildFinalExternalPrompt', () => {
  it('includes CI passed status', () => {
    const prompt = buildFinalExternalPrompt(BASE_PR, 'passed', []);
    expect(prompt).toContain('All checks passed');
  });

  it('includes CI failed status and failed check names', () => {
    const prompt = buildFinalExternalPrompt(BASE_PR, 'failed', ['unit-tests', 'lint']);
    expect(prompt).toContain('Failed');
    expect(prompt).toContain('unit-tests');
    expect(prompt).toContain('lint');
  });

  it('handles no_runs status', () => {
    const prompt = buildFinalExternalPrompt(BASE_PR, 'no_runs', []);
    expect(prompt).toContain('No CI runs found');
  });

  it('asks for a definitive merge recommendation', () => {
    const prompt = buildFinalExternalPrompt(BASE_PR, 'passed', []);
    expect(prompt.toLowerCase()).toContain('definitive');
  });
});
