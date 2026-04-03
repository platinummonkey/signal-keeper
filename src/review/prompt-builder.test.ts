import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from './prompt-builder.js';
import type { GithubPR } from '../github/types.js';

const BASE_PR: GithubPR = {
  owner: 'acme', repo: 'widget', number: 42,
  title: 'Fix null dereference', author: 'alice',
  headSha: 'abc123', baseBranch: 'main',
  state: 'open', url: 'https://github.com/acme/widget/pull/42',
  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  isDraft: false,
};

describe('buildReviewPrompt', () => {
  it('includes PR metadata', () => {
    const prompt = buildReviewPrompt(BASE_PR);
    expect(prompt).toContain('acme/widget');
    expect(prompt).toContain('PR #42');
    expect(prompt).toContain('Fix null dereference');
    expect(prompt).toContain('alice');
  });

  it('includes file list when files are present', () => {
    const pr = {
      ...BASE_PR,
      files: [{ filename: 'src/foo.ts', status: 'modified' as const, additions: 10, deletions: 2 }],
    };
    const prompt = buildReviewPrompt(pr);
    expect(prompt).toContain('src/foo.ts');
    expect(prompt).toContain('+10/-2');
  });

  it('falls back when no files provided', () => {
    const prompt = buildReviewPrompt(BASE_PR);
    expect(prompt).toContain('file list unavailable');
  });

  it('includes diff section when diff present', () => {
    const pr = { ...BASE_PR, diff: '-old line\n+new line' };
    const prompt = buildReviewPrompt(pr);
    expect(prompt).toContain('```diff');
    expect(prompt).toContain('+new line');
  });

  it('includes custom instruction section', () => {
    const prompt = buildReviewPrompt(BASE_PR, 'Focus on security');
    expect(prompt).toContain('Special Instructions');
    expect(prompt).toContain('Focus on security');
  });

  it('truncates very long diffs', () => {
    const longDiff = 'a'.repeat(60_000);
    const prompt = buildReviewPrompt({ ...BASE_PR, diff: longDiff });
    expect(prompt).toContain('diff truncated');
  });
});
