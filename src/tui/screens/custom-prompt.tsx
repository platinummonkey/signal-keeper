import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface CustomPromptScreenProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}

export function CustomPromptScreen({ onSubmit, onCancel }: CustomPromptScreenProps) {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
    if (key.return) {
      // Empty Enter = plain re-review with no extra instruction
      onSubmit(value.trim());
    }
  });

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>Custom Re-Review Prompt</Text>
      <Text dimColor>
        Add extra instructions for Claude, or press <Text bold>Enter</Text> with an empty field to re-review as-is. <Text bold>Esc</Text> to cancel.
      </Text>
      <Box borderStyle="single" paddingX={1}>
        <TextInput value={value} onChange={setValue} placeholder="e.g. Focus on security concerns… (or leave empty)" />
      </Box>
    </Box>
  );
}
