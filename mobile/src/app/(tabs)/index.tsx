import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { StatsDashboard } from '@/api/types';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { Navbar } from '@/components/Navbar';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Section } from '@/components/Section';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';
import { formatTanggalWaktu } from '@/utils/format';

export default function DashboardScreen() {
  const { admin, logout } = useAuth();
  const [stats, setStats] = useState<StatsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <ScreenContainer>
      <Navbar adminName={admin?.nama_lengkap || admin?.username || ''} onLogout={logout} />
      <ScrollView>
        <Text style={styles.title}>Dashboard Utama</Text>
        <Text style={styles.subtitle}>Selamat datang di dashboard admin chatbot administrasi desa</Text>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !stats ? (
          <Text style={styles.muted}>Memuat data...</Text>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard value={stats.totalLayanan} label="Total Layanan" />
              <StatCard value={stats.totalChat} label="Total Percakapan" />
              <StatCard value={stats.totalChatHariIni} label="Chat Hari Ini" />
            </View>

            <Section title="Top 5 Layanan Paling Banyak Ditanya">
              {stats.topLayanan.length > 0 ? (
                <DataTable
                  columns={[
                    { key: 'no', title: 'No', width: 60, render: (_: any, i: number) => <Text>{i + 1}</Text> },
                    { key: 'nama', title: 'Nama Layanan', render: (row) => <Text>{row.nama}</Text> },
                    {
                      key: 'jumlah',
                      title: 'Jumlah Pertanyaan',
                      width: 160,
                      render: (row) => <Text style={styles.bold}>{row.jumlah}</Text>,
                    },
                  ]}
                  data={stats.topLayanan}
                />
              ) : (
                <Text style={styles.muted}>Belum ada data pertanyaan.</Text>
              )}
            </Section>

            <Section title="Percakapan Terbaru">
              {stats.chatTerbaru.length > 0 ? (
                <>
                  <DataTable
                    columns={[
                      {
                        key: 'waktu',
                        title: 'Waktu',
                        width: 160,
                        render: (row) => <Text style={styles.muted}>{formatTanggalWaktu(row.waktu)}</Text>,
                      },
                      { key: 'nomor', title: 'Nomor WA', width: 120, render: (row) => <Text>{row.nomor_wa}</Text> },
                      {
                        key: 'pesan',
                        title: 'Pesan',
                        render: (row) => (
                          <Text numberOfLines={1} style={styles.truncate}>
                            {row.pesan_masuk}
                          </Text>
                        ),
                      },
                      {
                        key: 'layanan',
                        title: 'Layanan',
                        width: 150,
                        render: (row) =>
                          row.layanan_nama ? <Badge label={row.layanan_nama} /> : <Text style={styles.muted}>-</Text>,
                      },
                    ]}
                    data={stats.chatTerbaru}
                  />
                  <View style={styles.center}>
                    <Text style={styles.link}>Lihat Semua Riwayat</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.muted}>Belum ada percakapan.</Text>
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, color: Colors.text, marginBottom: 8 },
  subtitle: { color: Colors.textMuted, marginBottom: 32 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32 },
  muted: { color: Colors.textMuted },
  errorText: { color: Colors.errorText, marginBottom: 16 },
  bold: { fontWeight: '600' },
  truncate: { maxWidth: 300 },
  center: { alignItems: 'center', marginTop: 24 },
  link: { color: Colors.primary, fontSize: 14 },
});
