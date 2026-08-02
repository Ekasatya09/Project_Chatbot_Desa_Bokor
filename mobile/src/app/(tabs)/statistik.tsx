import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { Statistik } from '@/api/types';
import { DataTable } from '@/components/DataTable';
import { Navbar } from '@/components/Navbar';
import { ProgressBar } from '@/components/ProgressBar';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Section } from '@/components/Section';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';
import { formatTanggal, formatTanggalPanjang } from '@/utils/format';

export default function StatistikScreen() {
  const { admin, logout } = useAuth();
  const [data, setData] = useState<Statistik | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .statistik()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const maxLayanan = data?.statsPerLayanan[0]?.jumlah_pertanyaan || 0;
  const maxHari = data?.statsPerHari.reduce((max, s) => Math.max(max, s.jumlah), 0) || 0;

  return (
    <ScreenContainer>
      <Navbar adminName={admin?.nama_lengkap || admin?.username || ''} onLogout={logout} />
      <ScrollView>
        <Text style={styles.title}>Statistik Penggunaan Bot</Text>
        <Text style={styles.subtitle}>Analisis dan insight penggunaan chatbot</Text>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !data ? (
          <Text style={styles.muted}>Memuat data...</Text>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard value={data.totalUnikWA} label="Unique Users (WA)" />
              <StatCard value={data.statsPerLayanan.length} label="Total Layanan" />
              <StatCard value={data.statsPerLayanan[0]?.jumlah_pertanyaan || 0} label="Layanan Terpopuler" />
            </View>

            <Section title="Statistik Per Layanan">
              {data.statsPerLayanan.length > 0 ? (
                <DataTable
                  columns={[
                    { key: 'no', title: 'No', width: 40, render: (_: any, i: number) => <Text>{i + 1}</Text> },
                    { key: 'nama', title: 'Nama Layanan', render: (row) => <Text style={styles.bold}>{row.nama}</Text> },
                    {
                      key: 'jumlah',
                      title: 'Jumlah Pertanyaan',
                      width: 160,
                      render: (row) => (
                        <View>
                          <Text style={styles.bold}>{row.jumlah_pertanyaan}</Text>
                          {row.jumlah_pertanyaan > 0 && (
                            <ProgressBar value={row.jumlah_pertanyaan} max={maxLayanan} />
                          )}
                        </View>
                      ),
                    },
                    {
                      key: 'pertama',
                      title: 'Pertama Ditanya',
                      width: 120,
                      render: (row) =>
                        row.pertama_ditanya ? <Text style={styles.muted}>{formatTanggal(row.pertama_ditanya)}</Text> : <Text style={styles.muted}>-</Text>,
                    },
                    {
                      key: 'terakhir',
                      title: 'Terakhir Ditanya',
                      width: 120,
                      render: (row) =>
                        row.terakhir_ditanya ? <Text style={styles.muted}>{formatTanggal(row.terakhir_ditanya)}</Text> : <Text style={styles.muted}>-</Text>,
                    },
                  ]}
                  data={data.statsPerLayanan}
                />
              ) : (
                <Text style={styles.muted}>Belum ada data statistik layanan.</Text>
              )}
            </Section>

            <Section title="Aktivitas 7 Hari Terakhir">
              {data.statsPerHari.length > 0 ? (
                <DataTable
                  columns={[
                    {
                      key: 'tanggal',
                      title: 'Tanggal',
                      render: (row) => <Text>{formatTanggalPanjang(row.tanggal)}</Text>,
                    },
                    {
                      key: 'jumlah',
                      title: 'Jumlah Percakapan',
                      width: 200,
                      render: (row) => (
                        <View>
                          <Text style={styles.bold}>
                            {row.jumlah} percakapan
                          </Text>
                          <ProgressBar value={row.jumlah} max={maxHari} />
                        </View>
                      ),
                    },
                  ]}
                  data={data.statsPerHari}
                />
              ) : (
                <Text style={styles.muted}>Belum ada aktivitas dalam 7 hari terakhir.</Text>
              )}
            </Section>

            <View style={styles.insightBox}>
              <Text style={styles.insightTitle}>Insight</Text>
              {data.statsPerLayanan.length > 0 && data.statsPerLayanan[0].jumlah_pertanyaan > 0 && (
                <Text style={styles.insightItem}>
                  Layanan "{data.statsPerLayanan[0].nama}" adalah yang paling banyak ditanyakan dengan{' '}
                  {data.statsPerLayanan[0].jumlah_pertanyaan} pertanyaan.
                </Text>
              )}
              {data.statsPerHari.length > 0 && (
                <Text style={styles.insightItem}>
                  Total aktivitas dalam 7 hari terakhir: {data.statsPerHari.reduce((sum, s) => sum + s.jumlah, 0)} percakapan.
                </Text>
              )}
              <Text style={styles.insightItem}>
                Chatbot telah melayani {data.totalUnikWA} nomor WhatsApp yang berbeda.
              </Text>
            </View>
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
  insightBox: {
    backgroundColor: Colors.insightBg,
    borderWidth: 1,
    borderColor: Colors.insightBorder,
    borderRadius: 8,
    padding: 20,
    marginTop: 8,
  },
  insightTitle: { fontWeight: '600', color: Colors.insightText, marginBottom: 12 },
  insightItem: { color: Colors.insightText, marginBottom: 8, lineHeight: 20 },
});
