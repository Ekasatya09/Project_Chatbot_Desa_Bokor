import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { Colors } from '@/theme';

interface SesiLiveChat {
  id: number;
  nomor_wa_bersih: string;
  status: string;
}

/**
 * Banner notifikasi di tengah-atas layar.
 * Muncul saat ada sesi live chat BARU (pengguna memakai fitur 98).
 * Polling setiap 5 detik; ID sesi yang sudah ditutup tidak muncul lagi (per-sesi).
 */
export function LiveChatNotif() {
  const [banner, setBanner] = useState<SesiLiveChat | null>(null);
  const shownIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function cek() {
      try {
        const data = await api.liveChatList();
        if (cancelled) return;

        const aktif = (data.sesiList || []).filter((s) => s.status === 'aktif');

        // Sesi aktif yang belum ditampilkan → tampilkan banner
        const baru = aktif.find((s) => s.id !== shownIdRef.current);
        if (baru) {
          shownIdRef.current = baru.id;
          setBanner(baru);
        }

        // Tidak ada sesi aktif → sembunyikan
        if (aktif.length === 0) {
          shownIdRef.current = null;
          setBanner(null);
        }
      } catch {
        // abaikan (misal 401 saat sesi kedaluwarsa)
      }
    }

    cek();
    interval = setInterval(cek, 5000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  if (!banner) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.banner}>
        <Text style={styles.icon}>🔔</Text>
        <View style={styles.body}>
          <Text style={styles.title}>Permintaan Live Chat Masuk!</Text>
          <Text style={styles.text}>
            Pengguna +{banner.nomor_wa_bersih} meminta chat langsung dengan admin (fitur 98).
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btnBuka, pressed && styles.pressed]}
            onPress={() => {
              // Di web, arahkan ke halaman Live Chat EJS; di native cukup tutup banner
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = '/live-chat';
              }
              setBanner(null);
            }}>
            <Text style={styles.btnBukaText}>Buka</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btnTutup, pressed && styles.pressed]}
            onPress={() => setBanner(null)}
            hitSlop={8}>
            <Text style={styles.btnTutupText}>✕</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: 520,
    width: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 10,
  },
  icon: { fontSize: 22 },
  body: { flex: 1 },
  title: { fontWeight: '700', color: Colors.text },
  text: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnBuka: {
    backgroundColor: Colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnBukaText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  btnTutup: {
    padding: 4,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTutupText: { color: Colors.textMuted, fontSize: 15 },
  pressed: { opacity: 0.7 },
});
