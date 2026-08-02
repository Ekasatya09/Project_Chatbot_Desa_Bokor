import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/theme';

interface AlertProps {
  type: 'success' | 'error';
  message: string;
}

export function Alert({ type, message }: AlertProps) {
  const isSuccess = type === 'success';
  return (
    <View style={[styles.base, isSuccess ? styles.success : styles.error]}>
      <Text style={[styles.text, isSuccess ? styles.successText : styles.errorText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
    borderWidth: 1,
  },
  success: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  error: { backgroundColor: Colors.errorBg, borderColor: Colors.errorBorder },
  successText: { color: Colors.successText },
  errorText: { color: Colors.errorText },
  text: { fontSize: 14 },
});
