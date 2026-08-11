import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/theme';

interface EmptyStateProps {
  message: string;
  children?: React.ReactNode;
}

export function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  message: { fontSize: 15, color: Colors.textMuted, marginBottom: 16, textAlign: 'center' },
});
