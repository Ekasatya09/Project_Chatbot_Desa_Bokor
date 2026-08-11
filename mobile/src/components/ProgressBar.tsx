import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/theme';

interface ProgressBarProps {
  value: number;
  max: number;
}

export function ProgressBar({ value, max }: ProgressBarProps) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${width}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    backgroundColor: Colors.bg,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: '100%', backgroundColor: Colors.primary },
});
