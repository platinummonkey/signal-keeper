import type { ReviewOutput, ReviewCategory } from './types.js';

const CATEGORY_PRIORITY: Record<ReviewCategory, number> = {
  'block':           4,
  'needs-changes':   3,
  'fix-merge':       2,  // code looks fine but CI is failing
  'needs-attention': 1,
  'auto-merge':      0,
};

export function escalateCategory(current: ReviewCategory, candidate: ReviewCategory): ReviewCategory {
  return CATEGORY_PRIORITY[candidate] > CATEGORY_PRIORITY[current] ? candidate : current;
}

export function validateReviewOutput(raw: unknown): ReviewOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Review output is not an object');
  }
  const r = raw as Record<string, unknown>;

  const validCategories = ['auto-merge', 'needs-attention', 'needs-changes', 'block'];
  if (!validCategories.includes(r.category as string)) {
    throw new Error(`Invalid category: ${r.category}`);
  }
  if (typeof r.summary !== 'string' || r.summary.trim() === '') {
    throw new Error('Missing summary');
  }
  if (!Array.isArray(r.notes)) r.notes = [];
  if (!Array.isArray(r.suggestedChanges)) r.suggestedChanges = [];
  if (typeof r.confidence !== 'number') r.confidence = 0.5;

  return r as unknown as ReviewOutput;
}
