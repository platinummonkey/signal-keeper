import React from 'react';
import { Box, Text } from 'ink';

interface Action {
  key: string;
  label: string;
  disabled?: boolean;
}

interface ActionBarProps {
  actions: Action[];
}

export function ActionBar({ actions }: ActionBarProps) {
  return (
    <Box gap={2} paddingX={1}>
      {actions.map((a) => (
        <Box key={a.key} gap={1}>
          <Text bold color={a.disabled ? 'gray' : 'cyan'}>[{a.key}]</Text>
          <Text dimColor={a.disabled}>{a.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
