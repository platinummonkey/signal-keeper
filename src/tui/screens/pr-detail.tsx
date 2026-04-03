import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ReviewPanel } from '../components/review-panel.js';
import { ActionBar } from '../components/action-bar.js';
import { StatusBar } from '../components/status-bar.js';
import { usePRDetail } from '../hooks/use-pr-detail.js';
import type { PRWithReview } from '../hooks/use-pr-list.js';
import type { ConfigOutput } from '../../config/schema.js';

interface PRDetailScreenProps {
  pr: PRWithReview;
  config: ConfigOutput;
  onBack: () => void;
  onMerge: (pr: PRWithReview) => void;
  onComment: (pr: PRWithReview) => void;
  onClose: (pr: PRWithReview) => void;
  onReReview: (pr: PRWithReview, customPrompt?: string) => void;
  onAutofix: (pr: PRWithReview) => void;
  onApproveCI: (pr: PRWithReview) => void;
}

export function PRDetailScreen({
  pr,
  onBack,
  onMerge,
  onComment,
  onClose,
  onReReview,
  onAutofix,
  onApproveCI,
}: PRDetailScreenProps) {
  const { review, decision } = usePRDetail(pr);
  const [statusMsg, setStatusMsg] = useState<string | undefined>();

  useInput((input, key) => {
    if (key.escape || input === 'q') { onBack(); return; }
    if (input === 'm') { onMerge(pr); return; }
    if (input === 'c') { onComment(pr); return; }
    if (input === 'x') { onClose(pr); return; }
    if (input === 'p') { onReReview(pr); return; }
    if (input === 'r') { onReReview(pr); return; }
    if (input === 'f') { onAutofix(pr); return; }
    if (input === 'a' && pr.is_external && pr.external_stage === 'awaiting_approval') {
      onApproveCI(pr); return;
    }
  });

  const canMerge = review?.category === 'auto-merge';

  return (
    <Box flexDirection="column" height="100%">
      {/* PR header */}
      <Box paddingX={1} gap={2} flexWrap="wrap">
        <Text bold color="cyan">{pr.owner}/{pr.repo}#{pr.number}</Text>
        <Text bold>{pr.title}</Text>
      </Box>
      <Box paddingX={1} gap={3}>
        <Text dimColor>by {pr.author}</Text>
        {pr.is_external ? <Text color="magenta" bold>[external]</Text> : null}
        <Text dimColor>base: {pr.base_branch}</Text>
        <Text dimColor>sha: {pr.head_sha.slice(0, 7)}</Text>
        {pr.external_stage === 'awaiting_approval' && <Text color="yellow" bold>⏸ awaiting CI approval</Text>}
        {pr.external_stage === 'ci_pending' && <Text color="cyan">⟳ CI running</Text>}
        {pr.external_stage === 'complete' && <Text color="green">✓ final review done</Text>}
        {decision && (
          <Text color="green">✓ {decision.action}{decision.note ? ` — ${decision.note.slice(0, 40)}` : ''}</Text>
        )}
      </Box>

      {/* Review content */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingY={1}>
        {review ? (
          <ReviewPanel review={review} />
        ) : (
          <Box paddingX={2}>
            <Text dimColor>No review yet — daemon may still be processing.</Text>
          </Box>
        )}
      </Box>

      {/* Actions */}
      <ActionBar actions={[
        { key: 'm', label: 'merge', disabled: !canMerge },
        { key: 'f', label: 'merge+fix', disabled: !review },
        { key: 'c', label: 'comment' },
        { key: 'x', label: 'close' },
        { key: 'p', label: 're-review' },
        ...(pr.is_external && pr.external_stage === 'awaiting_approval'
          ? [{ key: 'a', label: 'approve CI' }]
          : []),
        { key: 'Esc', label: 'back' },
      ]} />

      <StatusBar message={statusMsg} />
    </Box>
  );
}
