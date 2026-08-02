import React from 'react';
import { DimensionValue, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/theme';

export interface Column<T> {
  key: string;
  title: string;
  width?: DimensionValue;
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
}

export function DataTable<T>({ columns, data }: DataTableProps<T>) {
  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        {columns.map((col) => (
          <View key={col.key} style={[styles.headerCell, col.width ? { width: col.width } : styles.flexCell]}>
            <Text style={styles.headerText}>{col.title}</Text>
          </View>
        ))}
      </View>
      {data.map((row, i) => (
        <View key={i} style={styles.row}>
          {columns.map((col) => (
            <View key={col.key} style={[styles.cell, col.width ? { width: col.width } : styles.flexCell]}>
              {col.render(row, i)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.card,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg,
    borderBottomWidth: 2,
    borderBottomColor: Colors.border,
  },
  headerCell: { padding: 12, justifyContent: 'center' },
  flexCell: { flex: 1 },
  headerText: { fontWeight: '600', color: Colors.text, fontSize: 14 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cell: { padding: 12, justifyContent: 'center' },
});
