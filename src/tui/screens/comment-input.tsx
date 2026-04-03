import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface CommentInputScreenProps {
  prLabel: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentInputScreen({ prLabel, onSubmit, onCancel }: CommentInputScreenProps) {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) onCancel();
    if (key.return && value.trim()) onSubmit(value.trim());
  });

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>Comment on {prLabel}</Text>
      <Text dimColor>Type your comment. Press Enter to post, Esc to cancel.</Text>
      <Box borderStyle="single" paddingX={1}>
        <TextInput value={value} onChange={setValue} placeholder="Leave a comment…" />
      </Box>
    </Box>
  );
}
