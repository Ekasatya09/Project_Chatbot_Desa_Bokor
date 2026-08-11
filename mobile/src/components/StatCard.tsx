import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/theme';

interface StatCardProps {
  value: string | number;
  label: string;
}

export function StatCard({ value, label }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 24,
    paddingHorizontal: 20,
    minWidth: 160,
    flex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  value: { fontSize: 32, fontWeight: '600', color: Colors.primary, lineHeight: 36, marginBottom: 4 },
  label: { color: Colors.textMuted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
});
