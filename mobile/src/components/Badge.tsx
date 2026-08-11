import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/theme';

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '500' },
});
