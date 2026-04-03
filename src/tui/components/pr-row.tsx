import React from 'react';
import { Box, Text } from 'ink';
import type { PRWithReview } from '../hooks/use-pr-list.js';
import type { ReviewCategory } from '../../review/types.js';

const CATEGORY_BADGE: Record<ReviewCategory, { label: string; color: string }> = {
  'auto-merge': { label: '✓ auto-merge', color: 'green' },
  'needs-attention': { label: '👀 attention', color: 'yellow' },
  'needs-changes': { label: '⚠ changes', color: 'magenta' },
  'block': { label: '✗ block', color: 'red' },
};

interface PRRowProps {
  pr: PRWithReview;
  selected: boolean;
  terminalWidth: number;
}

export function PRRow({ pr, selected, terminalWidth }: PRRowProps) {
  const badge = pr.latest_review
    ? CATEGORY_BADGE[pr.latest_review.category as ReviewCategory]
    : { label: '… pending', color: 'gray' };

  const repoLabel = `${pr.owner}/${pr.repo}#${pr.number}`;
  const maxTitleLen = Math.max(20, terminalWidth - repoLabel.length - badge.label.length - 10);
  const title = pr.title.length > maxTitleLen
    ? pr.title.slice(0, maxTitleLen - 1) + '…'
    : pr.title;

  return (
    <Box gap={1} paddingX={1}>
      <Text color={selected ? 'cyan' : undefined} bold={selected}>{selected ? '▶' : ' '}</Text>
      <Text bold={selected} color="cyan">{repoLabel}</Text>
      {pr.is_external ? <Text color="magenta" bold>[ext]</Text> : null}
      <Text bold={selected} wrap="truncate-end">{title}</Text>
      <Text color={badge.color} bold>{badge.label}</Text>
      {pr.is_external && pr.external_stage === 'awaiting_approval' && (
        <Text color="yellow" bold>⏸ awaiting CI</Text>
      )}
      {pr.is_external && pr.external_stage === 'ci_pending' && (
        <Text color="cyan">⟳ CI running</Text>
      )}
    </Box>
  );
}
