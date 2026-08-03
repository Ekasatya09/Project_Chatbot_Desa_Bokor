import { Stack, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api } from '@/api/client';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

function AuthGate() {
  const { admin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [botChecked, setBotChecked] = useState(false);
  const [botConnected, setBotConnected] = useState(false);

  // Poll status bot selama admin login, supaya state selalu fresh.
  // Layar qr-connect redirect ke tabs sendiri saat connected; AuthGate
  // hanya mengarahkan admin yang belum terhubung ke qr-connect.
  useEffect(() => {
    if (!admin) return;

    let cancelled = false;
    const check = () =>
      api
        .botStatus()
        .then((data) => {
          if (!cancelled) setBotConnected(data.status === 'connected');
        })
        .catch(() => {
          // Jika API gagal, jangan blokir — biarkan masuk ke tabs
          if (!cancelled) setBotConnected(true);
        })
        .finally(() => {
          if (!cancelled) setBotChecked(true);
        });

    check();
    const interval = setInterval(check, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [admin]);

  useEffect(() => {
    if (loading) return;
    if (!admin && pathname !== '/login') {
      router.replace('/login');
      return;
    }
    if (!admin) return;

    // Sudah login. Layar qr-connect yang mengelola transisi setelah scan:
    // di sini kita hanya memastikan admin yang belum terhubung diarahkan ke sana.
    if (pathname === '/login') {
      router.replace('/(tabs)');
    } else if (pathname !== '/qr-connect' && botChecked && !botConnected) {
      router.replace('/qr-connect');
    }
  }, [loading, admin, botChecked, botConnected, pathname, router]);

  if (loading || (admin && !botChecked && pathname !== '/qr-connect')) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="layanan/[id]" />
      <Stack.Screen name="qr-connect" />
      <Stack.Screen name="login" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
