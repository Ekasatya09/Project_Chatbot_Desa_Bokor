import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';

const POLL_INTERVAL = 3000;

export default function QRConnectScreen() {
  const router = useRouter();
  const { admin, logout } = useAuth();

  const [status, setStatus] = useState('checking'); // checking | disconnected | connecting | connected | error
  const [waNomor, setWaNomor] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const startedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll status ──────────────────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const data = await api.botStatus();
      setStatus(data.status);
      setWaNomor(data.wa_nomor);
      if (data.status === 'connecting') {
        try {
          const qrData = await api.botQR();
          if (qrData.qr) setQr(qrData.qr);
        } catch {
          // QR mungkin belum siap — biarkan polling berikutnya mencoba lagi
        }
      } else {
        setQr(null);
      }
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Gagal memuat status bot.');
    }
  }, []);

  // ── Init: auto-connect bila belum terhubung ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await api.botStatus();
        if (cancelled) return;
        setStatus(data.status);
        setWaNomor(data.wa_nomor);

        if (data.status === 'disconnected') {
          setStatus('connecting');
          startedRef.current = true;
          try {
            await api.botConnect();
          } catch (e: any) {
            if (cancelled) return;
            // Mungkin sudah connecting dari dashboard — cek status lagi
            const again = await api.botStatus();
            if (cancelled) return;
            if (again.status !== 'connecting' && again.status !== 'connected') {
              setStatus('error');
              setError(e?.message || 'Gagal memulai koneksi WhatsApp.');
            } else {
              setStatus(again.status);
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setStatus('error');
        setError(e?.message || 'Gagal memuat status bot.');
      }
    })();

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Mulai polling saat connecting ─────────────────────────────────────────
  useEffect(() => {
    if (status === 'connecting') {
      if (!pollRef.current) {
        pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [status, pollStatus]);

  // ── Redirect ke tabs setelah terhubung ────────────────────────────────────
  // AuthGate (di _layout) yang memantau status & mengarahkan ke tabs saat
  // bot connected — layar ini hanya menampilkan status & QR.
  useEffect(() => {
    if (status === 'connected') {
      router.replace('/(tabs)');
    }
  }, [status, router]);

  // ── Tombol hubungkan ulang ────────────────────────────────────────────────
  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      await api.botConnect();
      setStatus('connecting');
    } catch (e: any) {
      setError(e?.message || 'Gagal memulai koneksi WhatsApp.');
    } finally {
      setConnecting(false);
    }
  }

  const adminName = admin?.nama_lengkap || admin?.username || '';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.brand}>🏛️ Dashboard Chatbot Desa</Text>
        <View style={styles.user}>
          <Text style={styles.userName}>{adminName}</Text>
          <Button title="Logout" variant="danger" size="sm" onPress={logout} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>📱 Hubungkan WhatsApp</Text>
        <Text style={styles.subtitle}>
          Bot WhatsApp belum terhubung ke akun Anda. Scan QR code di bawah untuk menautkan perangkat.
        </Text>

        <View style={styles.card}>
          {status === 'checking' && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.muted}>Memeriksa status koneksi...</Text>
            </View>
          )}

          {status === 'connecting' && (
            <>
              <View style={styles.qrBox}>
                {qr ? (
                  <Image
                    source={{ uri: qr }}
                    style={styles.qrImage}
                    resizeMode="contain"
                    accessibilityLabel="QR Code WhatsApp"
                  />
                ) : (
                  <View style={styles.centerBox}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.muted}>Menunggu QR code dari server...</Text>
                  </View>
                )}
              </View>
              <Text style={styles.muted}>
                Scan dengan WhatsApp → Perangkat Tertaut → Tautkan Perangkat
              </Text>
              <View style={styles.stepsBox}>
                <Text style={styles.stepsTitle}>📋 Cara scan QR:</Text>
                {[
                  'Buka WhatsApp di HP',
                  'Ketuk ⋮ (titik tiga) → Perangkat Tertaut',
                  'Ketuk Tautkan Perangkat',
                  'Arahkan kamera ke QR di atas',
                ].map((step, i) => (
                  <Text key={step} style={styles.stepItem}>
                    {i + 1}. {step}
                  </Text>
                ))}
              </View>
            </>
          )}

          {status === 'connected' && (
            <View style={styles.centerBox}>
              <Text style={styles.bigIcon}>✅</Text>
              <Text style={styles.successText}>Bot aktif dan siap menerima pesan!</Text>
              {waNomor ? (
                <Text style={styles.waNomor}>📞 Terhubung sebagai: +{waNomor}</Text>
              ) : null}
            </View>
          )}

          {(status === 'disconnected' || status === 'error') && (
            <View style={styles.centerBox}>
              <Text style={styles.bigIcon}>📵</Text>
              <Text style={styles.muted}>
                {status === 'error'
                  ? 'Terjadi kesalahan saat menghubungkan ke server.'
                  : 'WhatsApp belum terhubung. Klik tombol di bawah untuk memulai.'}
              </Text>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <View style={styles.buttonWrap}>
                <Button
                  title={connecting ? '⏳ Menghubungkan...' : '📲 Hubungkan WhatsApp'}
                  size="block"
                  disabled={connecting}
                  onPress={handleConnect}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  brand: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userName: { color: Colors.textMuted, fontSize: 14 },
  scroll: { paddingBottom: 32 },
  title: { fontSize: 26, color: Colors.text, marginBottom: 8 },
  subtitle: { color: Colors.textMuted, marginBottom: 24 },
  card: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  qrBox: {
    backgroundColor: Colors.bg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    minWidth: 280,
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: { width: 260, height: 260 },
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 12 },
  bigIcon: { fontSize: 48 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  successText: { fontWeight: '600', color: Colors.successText, fontSize: 16 },
  waNomor: { color: Colors.successText, fontWeight: '600', fontSize: 14 },
  errorText: { color: Colors.errorText, marginTop: 4, textAlign: 'center' },
  stepsBox: {
    alignSelf: 'stretch',
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  stepsTitle: { fontWeight: '600', color: Colors.text, marginBottom: 8 },
  stepItem: { color: Colors.textMuted, fontSize: 14, marginBottom: 4 },
  buttonWrap: { alignSelf: 'stretch', marginTop: 8 },
});
