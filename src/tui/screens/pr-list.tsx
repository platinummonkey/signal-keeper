import React, { useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { PRRow } from '../components/pr-row.js';
import { ActionBar } from '../components/action-bar.js';
import { StatusBar } from '../components/status-bar.js';
import { usePRList, type PRWithReview, type CategoryFilter } from '../hooks/use-pr-list.js';

interface PRListScreenProps {
  onOpenDetail: (pr: PRWithReview) => void;
  onQuit: () => void;
  statusMessage?: string;
}

const FILTER_KEYS: Record<string, CategoryFilter> = {
  '1': 'auto-merge',
  '2': 'needs-attention',
  '3': 'needs-changes',
  '4': 'block',
};

export function PRListScreen({ onOpenDetail, onQuit, statusMessage }: PRListScreenProps) {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;

  const {
    prs,
    allPrs,
    filter,
    setFilter,
    selectedIndex,
    setSelectedIndex,
    selectedPR,
    refresh,
  } = usePRList(2000);

  useInput((input, key) => {
    if (input === 'q' || key.escape || input === '\x1b') {
      onQuit();
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex(Math.min(selectedIndex + 1, prs.length - 1));
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex(Math.max(selectedIndex - 1, 0));
    }
    if (key.return && selectedPR) {
      onOpenDetail(selectedPR);
    }
    if (input === 'r') {
      refresh();
    }
    if (input === '0') {
      setFilter('all');
      setSelectedIndex(0);
    }
    if (FILTER_KEYS[input]) {
      setFilter(FILTER_KEYS[input]);
      setSelectedIndex(0);
    }
  });

  const filterLabel = filter === 'all' ? 'all' : filter;
  const counts: Record<string, number> = { all: allPrs.length };
  for (const pr of allPrs) {
    const cat = pr.latest_review?.category ?? 'pending';
    counts[cat] = (counts[cat] ?? 0) + 1;
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box paddingX={1} gap={3}>
        <Text bold>PR Auto-Reviewer</Text>
        <Text dimColor>
          [0] all({counts.all ?? 0})  [1] auto-merge({counts['auto-merge'] ?? 0})  [2] attention({counts['needs-attention'] ?? 0})  [3] changes({counts['needs-changes'] ?? 0})  [4] block({counts['block'] ?? 0})
        </Text>
        <Text color={filter === 'all' ? 'cyan' : 'yellow'}>filter: {filterLabel}</Text>
      </Box>

      {/* PR List */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {prs.length === 0 ? (
          <Box paddingX={2} paddingY={1}>
            <Text dimColor>
              {allPrs.length === 0
                ? 'No open PRs found. Is the daemon running? (pr-auto-reviewer start)'
                : `No PRs match filter "${filter}"`}
            </Text>
          </Box>
        ) : (
          prs.map((pr, i) => (
            <PRRow
              key={`${pr.owner}/${pr.repo}#${pr.number}`}
              pr={pr}
              selected={i === selectedIndex}
              terminalWidth={terminalWidth}
            />
          ))
        )}
      </Box>

      {/* Action bar */}
      <ActionBar actions={[
        { key: '↑↓/jk', label: 'navigate' },
        { key: 'Enter', label: 'detail' },
        { key: 'r', label: 'refresh' },
        { key: '0-4', label: 'filter' },
        { key: 'q', label: 'quit' },
      ]} />

      <StatusBar message={statusMessage} />
    </Box>
  );
}
