import React from 'react';
import { Box, Text } from 'ink';
import type { Review } from '../../state/models.js';
import type { ReviewCategory } from '../../review/types.js';

const CATEGORY_COLOR: Record<ReviewCategory, string> = {
  'auto-merge': 'green',
  'needs-attention': 'yellow',
  'needs-changes': 'magenta',
  'block': 'red',
};

interface ReviewPanelProps {
  review: Review;
}

export function ReviewPanel({ review }: ReviewPanelProps) {
  const color = CATEGORY_COLOR[review.category as ReviewCategory] ?? 'white';

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box gap={2}>
        <Text bold color={color}>[{review.category.toUpperCase()}]</Text>
        <Text dimColor>confidence: {Math.round(review.confidence * 100)}%</Text>
        {review.cost_usd != null && (
          <Text dimColor>cost: ${review.cost_usd.toFixed(4)}</Text>
        )}
      </Box>

      <Text wrap="wrap">{review.summary}</Text>

      {review.notes.length > 0 && (
        <Box flexDirection="column">
          <Text bold underline>Notes</Text>
          {review.notes.map((note, i) => (
            <Text key={i} wrap="wrap">  • {note}</Text>
          ))}
        </Box>
      )}

      {review.suggested_changes.length > 0 && (
        <Box flexDirection="column">
          <Text bold underline>Suggested Changes</Text>
          {review.suggested_changes.map((sc, i) => (
            <Box key={i} flexDirection="column" marginLeft={2}>
              <Text bold color="cyan">{sc.file}</Text>
              <Text wrap="wrap">  {sc.description}</Text>
              {sc.suggestion && (
                <Text dimColor wrap="wrap">  → {sc.suggestion}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
