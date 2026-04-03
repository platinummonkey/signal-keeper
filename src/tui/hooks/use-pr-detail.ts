import { useState, useEffect } from 'react';
import { getLatestReview, getLatestDecision } from '../../state/models.js';
import type { PR, Review, Decision } from '../../state/models.js';

export function usePRDetail(pr: PR | null, pollMs = 2000) {
  const [review, setReview] = useState<Review | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => {
    if (!pr) {
      setReview(null);
      setDecision(null);
      return;
    }

    function load() {
      if (!pr) return;
      setReview(getLatestReview(pr.id) ?? null);
      setDecision(getLatestDecision(pr.id) ?? null);
    }

    load();
    const timer = setInterval(load, pollMs);
    return () => clearInterval(timer);
  }, [pr, pollMs]);

  return { review, decision };
}
