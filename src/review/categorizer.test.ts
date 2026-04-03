import { describe, it, expect } from 'vitest';
import { escalateCategory, validateReviewOutput } from './categorizer.js';

describe('escalateCategory', () => {
  it('keeps the more severe category', () => {
    expect(escalateCategory('auto-merge', 'block')).toBe('block');
    expect(escalateCategory('block', 'auto-merge')).toBe('block');
    expect(escalateCategory('needs-attention', 'needs-changes')).toBe('needs-changes');
    expect(escalateCategory('needs-changes', 'needs-attention')).toBe('needs-changes');
  });

  it('returns the same when equal', () => {
    expect(escalateCategory('needs-attention', 'needs-attention')).toBe('needs-attention');
  });
});

describe('validateReviewOutput', () => {
  const valid = {
    category: 'auto-merge',
    summary: 'Looks good',
    notes: ['Minor nit'],
    suggestedChanges: [],
    confidence: 0.9,
  };

  it('accepts a valid output', () => {
    const result = validateReviewOutput(valid);
    expect(result.category).toBe('auto-merge');
    expect(result.confidence).toBe(0.9);
  });

  it('throws on invalid category', () => {
    expect(() => validateReviewOutput({ ...valid, category: 'approve' })).toThrow(/Invalid category/);
  });

  it('throws on missing summary', () => {
    expect(() => validateReviewOutput({ ...valid, summary: '' })).toThrow(/Missing summary/);
  });

  it('defaults notes and suggestedChanges to [] when missing', () => {
    const result = validateReviewOutput({ category: 'block', summary: 'Danger' });
    expect(result.notes).toEqual([]);
    expect(result.suggestedChanges).toEqual([]);
  });

  it('defaults confidence to 0.5 when missing', () => {
    const result = validateReviewOutput({ category: 'needs-changes', summary: 'Fix this' });
    expect(result.confidence).toBe(0.5);
  });

  it('throws when given a non-object', () => {
    expect(() => validateReviewOutput('string')).toThrow();
    expect(() => validateReviewOutput(null)).toThrow();
  });
});
