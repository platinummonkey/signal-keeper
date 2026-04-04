import type { ReviewOutput, ReviewCategory } from './types.js';

const CATEGORY_PRIORITY: Record<ReviewCategory, number> = {
  'block':           5,
  'needs-changes':   4,
  'fix-merge':       3,  // code looks fine but CI is failing
  'needs-attention': 2,
  'merge-fix':       1,  // safe to merge, but worth a follow-up fix PR
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

  const validCategories = ['auto-merge', 'merge-fix', 'needs-attention', 'needs-changes', 'block'];
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
