import { useState, useEffect, useCallback } from 'react';
import { listOpenPRs } from '../../state/models.js';
import type { PR, Review } from '../../state/models.js';

export type PRWithReview = PR & { latest_review?: Review };

export type CategoryFilter = 'all' | 'auto-merge' | 'needs-attention' | 'needs-changes' | 'block';

export function usePRList(pollMs = 2000) {
  const [prs, setPRs] = useState<PRWithReview[]>([]);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const refresh = useCallback(() => {
    try {
      const all = listOpenPRs() as PRWithReview[];
      setPRs(all);
    } catch {
      // DB might not be ready yet
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const filtered = filter === 'all'
    ? prs
    : prs.filter((p) => p.latest_review?.category === filter);

  // Clamp index when list shrinks
  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  return {
    prs: filtered,
    allPrs: prs,
    filter,
    setFilter,
    selectedIndex: safeIndex,
    setSelectedIndex,
    selectedPR: filtered[safeIndex] ?? null,
    refresh,
  };
}
