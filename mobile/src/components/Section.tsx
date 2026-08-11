import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/theme';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
  },
  title: { fontSize: 16, marginBottom: 12, fontWeight: '600', color: Colors.text },
});
