import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (e: any) {
      setError(e?.message || 'Login gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.title}>Dashboard Chatbot Desa</Text>
            <Text style={styles.subtitle}>Silakan login untuk melanjutkan</Text>
          </View>

          {error && <Alert type="error" message={error} />}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoFocus
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <Button title="Login" size="block" onPress={handleSubmit} disabled={loading} />

          <View style={styles.footer}>
            <Text style={styles.muted}>
              Default: username <Text style={styles.code}>admin</Text>, password{' '}
              <Text style={styles.code}>admin123</Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.loginGradientStart },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  box: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 32,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 25,
    elevation: 10,
  },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  subtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 8 },
  formGroup: { marginBottom: 24 },
  label: { fontWeight: '500', color: Colors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  footer: { alignItems: 'center', paddingTop: 16, marginTop: 24, borderTopWidth: 1, borderTopColor: Colors.border },
  muted: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  code: {
    backgroundColor: Colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'monospace',
  },
});
