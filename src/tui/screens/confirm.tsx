import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmScreenProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmScreen({ message, onConfirm, onCancel }: ConfirmScreenProps) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onConfirm();
    if (input === 'n' || input === 'N' || key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" height="100%" justifyContent="center" alignItems="center">
      <Box flexDirection="column" padding={2} gap={1} borderStyle="round">
        <Text bold>{message}</Text>
        <Text>
          Press <Text color="green" bold>y</Text> to confirm, <Text color="red" bold>n</Text> / Esc to cancel.
        </Text>
      </Box>
    </Box>
  );
}
