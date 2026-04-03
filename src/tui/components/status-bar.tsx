import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  message?: string;
  error?: string;
}

export function StatusBar({ message, error }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      {error ? (
        <Text color="red">{error}</Text>
      ) : (
        <Text dimColor>{message ?? 'pr-auto-reviewer — q: quit  ?: help'}</Text>
      )}
    </Box>
  );
}
