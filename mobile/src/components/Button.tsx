import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { Colors } from '@/theme';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'block';
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        size === 'sm' && styles.sm,
        size === 'block' && styles.block,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Text
        style={[
          styles.text,
          size === 'sm' && styles.textSm,
          variant === 'secondary' && styles.textSecondary,
          variant === 'danger' && styles.textDanger,
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.secondary },
  danger: { backgroundColor: Colors.danger },
  sm: { paddingVertical: 6, paddingHorizontal: 12 },
  block: { width: '100%' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  textSm: { fontSize: 13 },
  textSecondary: { color: '#fff' },
  textDanger: { color: '#fff' },
});
