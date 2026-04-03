import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { ActionBar } from '../components/action-bar.js';
import { StatusBar } from '../components/status-bar.js';
import { usePRDetail } from '../hooks/use-pr-detail.js';
import { useScrollableContent, buildDetailLines } from '../hooks/use-scrollable-content.js';
import { openUrl } from '../../utils/open-url.js';
import type { PRWithReview } from '../hooks/use-pr-list.js';
import type { ConfigOutput } from '../../config/schema.js';

// Fixed UI rows: 2 header lines + 1 scroll indicator + 1 action bar + 1 status bar
const FIXED_ROWS = 5;

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
  onGenerateComment: (pr: PRWithReview) => void;
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
  onGenerateComment,
}: PRDetailScreenProps) {
  const { review, decision } = usePRDetail(pr);
  const [statusMsg, setStatusMsg] = useState<string | undefined>();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const terminalWidth = stdout?.columns ?? 80;

  const contentLines = buildDetailLines(pr.body ?? '', review, terminalWidth);
  const visibleRows = Math.max(4, terminalHeight - FIXED_ROWS);

  const { visibleLines, canScrollUp, canScrollDown, scrollDown, scrollUp, scrollToTop, scrollToBottom } =
    useScrollableContent(contentLines, visibleRows);

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '\x1b') { onBack(); return; }
    if (key.downArrow || input === 'j') { scrollDown(); return; }
    if (key.upArrow   || input === 'k') { scrollUp();   return; }
    if (key.pageDown)   { scrollDown(Math.floor(visibleRows / 2)); return; }
    if (key.pageUp)     { scrollUp(Math.floor(visibleRows / 2));   return; }
    if (input === 'g')  { scrollToTop(); return; }   // g = top (vim-style gg via single press)
    if (input === 'G')  { scrollToBottom(); return; }
    if (input === 'm')  { onMerge(pr); return; }
    if (input === 'c')  { onComment(pr); return; }
    if (input === 'x')  { onClose(pr); return; }
    if (input === 'p')  { onReReview(pr); return; }
    if (input === 'r')  { onReReview(pr, ''); return; }
    if (input === 'o')  { openUrl(pr.url); setStatusMsg(`Opened ${pr.url}`); return; }
    if (input === 'n')  { onGenerateComment(pr); return; } // 'n' for Note (g taken by scroll-top)
    if (input === 'f')  { onAutofix(pr); return; }
    if (input === 'a' && (!!pr.pending_approval || (pr.is_external && pr.external_stage === 'awaiting_approval'))) {
      onApproveCI(pr); return;
    }
  });

  const canMerge = review?.category === 'auto-merge';
  const needsApproval = !!pr.pending_approval || (pr.is_external && pr.external_stage === 'awaiting_approval');

  return (
    <Box flexDirection="column" height="100%">
      {/* Header row 1 */}
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">{pr.owner}/{pr.repo}#{pr.number}</Text>
        {pr.is_external ? <Text color="magenta" bold>[external]</Text> : null}
        <Text bold wrap="truncate-end">{pr.title}</Text>
      </Box>

      {/* Header row 2 */}
      <Box paddingX={1} gap={2}>
        <Text dimColor>by {pr.author}</Text>
        <Text dimColor>base: {pr.base_branch}</Text>
        <Text dimColor>sha: {pr.head_sha.slice(0, 7)}</Text>
        {needsApproval && <Text color="yellow" bold>⏸ workflows need approval — press [a]</Text>}
        {pr.external_stage === 'ci_pending' && <Text color="cyan">⟳ CI running</Text>}
        {pr.external_stage === 'complete' && <Text color="green">✓ final review done</Text>}
        {decision && <Text color="green">✓ {decision.action}</Text>}
      </Box>

      {/* Scrollable content */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {visibleLines.map((line, i) => (
          <Text
            key={i}
            bold={line.bold}
            dimColor={line.dim}
            color={line.color as Parameters<typeof Text>[0]['color']}
          >
            {line.indent ? ' '.repeat(line.indent * 2) : ''}{line.text}
          </Text>
        ))}
      </Box>

      {/* Scroll indicator */}
      <Box paddingX={1}>
        <Text dimColor>
          {canScrollUp ? '▲ ' : '  '}
          {`↑↓/jk scroll  g/G top/bottom  pgup/pgdn`}
          {canScrollDown ? ' ▼' : '  '}
        </Text>
      </Box>

      {/* Actions */}
      <ActionBar actions={[
        { key: 'm', label: 'merge', disabled: !canMerge },
        { key: 'f', label: 'autofix', disabled: !review },
        { key: 'c', label: 'comment' },
        { key: 'n', label: 'ai comment' },
        { key: 'x', label: 'close' },
        { key: 'r', label: 're-review' },
        { key: 'p', label: 'custom prompt' },
        { key: 'o', label: 'open' },
        ...(needsApproval ? [{ key: 'a', label: 'approve CI' }] : []),
        { key: 'Esc', label: 'back' },
      ]} />

      <StatusBar message={statusMsg} />
    </Box>
  );
}
