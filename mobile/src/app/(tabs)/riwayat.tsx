import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { api } from '@/api/client';
import { RiwayatResponse } from '@/api/types';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Navbar } from '@/components/Navbar';
import { Pagination } from '@/components/Pagination';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';
import { formatWaktuSingkat } from '@/utils/format';

const LIMIT = 20;

export default function RiwayatScreen() {
  const { admin, logout } = useAuth();
  const [data, setData] = useState<RiwayatResponse | null>(null);
  const [tanggalMulai, setTanggalMulai] = useState('');
  const [tanggalSelesai, setTanggalSelesai] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (page = 1) => {
      api
        .riwayat({ page, limit: LIMIT, tanggal_mulai: tanggalMulai, tanggal_selesai: tanggalSelesai })
        .then(setData)
        .catch((e) => setError(e.message));
    },
    [tanggalMulai, tanggalSelesai]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const page = data?.pagination.page ?? 1;

  return (
    <ScreenContainer>
      <Navbar adminName={admin?.nama_lengkap || admin?.username || ''} onLogout={logout} />
      <ScrollView>
        <Text style={styles.title}>Riwayat Percakapan</Text>
        <Text style={styles.subtitle}>Log semua percakapan antara warga dan chatbot</Text>

        <View style={styles.filterBox}>
          <View style={styles.filterRow}>
            <View style={styles.filterGroup}>
              <Text style={styles.label}>Tanggal Mulai</Text>
              <TextInput
                style={styles.input}
                value={tanggalMulai}
                onChangeText={setTanggalMulai}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={styles.filterGroup}>
              <Text style={styles.label}>Tanggal Selesai</Text>
              <TextInput
                style={styles.input}
                value={tanggalSelesai}
                onChangeText={setTanggalSelesai}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={styles.filterActions}>
              <Button title="Filter" onPress={() => load(1)} />
              <Button
                title="Reset"
                variant="secondary"
                onPress={() => {
                  setTanggalMulai('');
                  setTanggalSelesai('');
                  load(1);
                }}
              />
            </View>
          </View>
        </View>

        {data && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Total: <Text style={styles.infoStrong}>{data.pagination.total}</Text> percakapan
            </Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {data?.riwayatList.length ? (
          <>
            <DataTable
              columns={[
                {
                  key: 'waktu',
                  title: 'Waktu',
                  width: 130,
                  render: (row) => <Text style={styles.muted}>{formatWaktuSingkat(row.waktu)}</Text>,
                },
                { key: 'nomor', title: 'Nomor WA', width: 110, render: (row) => <Text style={styles.mono}>{row.nomor_wa}</Text> },
                {
                  key: 'pesan',
                  title: 'Pesan Masuk',
                  render: (row) => <Text numberOfLines={2}>{truncate(row.pesan_masuk, 60)}</Text>,
                },
                {
                  key: 'balasan',
                  title: 'Balasan Bot',
                  render: (row) => <Text numberOfLines={3}>{truncate(row.balasan_bot, 80)}</Text>,
                },
                {
                  key: 'layanan',
                  title: 'Layanan',
                  width: 120,
                  render: (row) =>
                    row.layanan_nama ? <Badge label={row.layanan_nama} /> : <Text style={styles.muted}>Menu/Error</Text>,
                },
              ]}
              data={data.riwayatList}
            />
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPrev={() => load(page - 1)}
              onNext={() => load(page + 1)}
            />
          </>
        ) : (
          <EmptyState message="Belum ada riwayat percakapan.">
            {(tanggalMulai || tanggalSelesai) && (
              <Button title="Reset Filter" variant="secondary" onPress={() => {
                setTanggalMulai('');
                setTanggalSelesai('');
                load(1);
              }} />
            )}
          </EmptyState>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.substring(0, max)}...` : text;
}

const styles = StyleSheet.create({
  title: { fontSize: 26, color: Colors.text, marginBottom: 8 },
  subtitle: { color: Colors.textMuted, marginBottom: 24 },
  filterBox: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' },
  filterGroup: { flex: 1, minWidth: 180 },
  label: { fontWeight: '500', color: Colors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  filterActions: { flexDirection: 'row', gap: 8 },
  infoBox: {
    backgroundColor: Colors.infoBg,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
  },
  infoText: { color: Colors.infoText, fontSize: 14 },
  infoStrong: { fontWeight: '700' },
  errorText: { color: Colors.errorText, marginBottom: 16 },
  muted: { color: Colors.textMuted, fontSize: 13 },
  mono: { fontFamily: 'monospace', fontSize: 13 },
});
