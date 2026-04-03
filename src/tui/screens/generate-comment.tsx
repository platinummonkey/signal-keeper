import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface GenerateCommentScreenProps {
  prLabel: string;
  hasSession: boolean;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

export function GenerateCommentScreen({ prLabel, hasSession, onSubmit, onCancel }: GenerateCommentScreenProps) {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) { onSubmit(value.trim()); }
  });

  return (
    <Box flexDirection="column" height="100%" justifyContent="center" alignItems="center">
      <Box flexDirection="column" padding={2} gap={1} borderStyle="round" width={70}>
        <Text bold>Generate PR Comment — {prLabel}</Text>
        {!hasSession && (
          <Text color="yellow">⚠ No review session found. Claude will write from scratch.</Text>
        )}
        <Text dimColor>
          Describe what the comment should say, or press <Text bold>Enter</Text> to summarise
          the review findings for the author. <Text bold>Esc</Text> to cancel.
        </Text>
        <Box borderStyle="single" paddingX={1}>
          <TextInput
            value={value}
            onChange={setValue}
            placeholder="e.g. Summarise what needs to change before this can merge…"
          />
        </Box>
      </Box>
    </Box>
  );
}
