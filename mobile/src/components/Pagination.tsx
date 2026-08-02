import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Colors } from '@/theme';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({ page, totalPages, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <View style={styles.container}>
      {page > 1 && <Button title="← Sebelumnya" variant="secondary" size="sm" onPress={onPrev} />}
      <Text style={styles.info}>
        Halaman {page} dari {totalPages}
      </Text>
      {page < totalPages && <Button title="Selanjutnya →" variant="secondary" size="sm" onPress={onNext} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 32,
    flexWrap: 'wrap',
  },
  info: { color: Colors.textMuted, fontSize: 14 },
});
