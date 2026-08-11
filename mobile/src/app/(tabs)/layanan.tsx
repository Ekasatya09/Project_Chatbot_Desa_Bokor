import React, { useCallback, useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Kategori, Layanan } from '@/api/types';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Navbar } from '@/components/Navbar';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';

// ─── types ───────────────────────────────────────────────────────────────────
interface KategoriModalState {
  open: boolean;
  editing: Kategori | null;
  nama: string;
}

export default function LayananScreen() {
  const { admin, logout } = useAuth();
  const router = useRouter();

  const [layananList, setLayananList] = useState<Layanan[]>([]);
  const [kategoriList, setKategoriList] = useState<Kategori[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Kategori modal state
  const [modal, setModal] = useState<KategoriModalState>({ open: false, editing: null, nama: '' });
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Collapsed state per kategori (by id/key)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    Promise.all([api.layananList(), api.kategoriList()])
      .then(([layRes, katRes]) => {
        setLayananList(layRes.layananList);
        setKategoriList(katRes.kategoriList);
      })
      .catch((e) => setMessage({ type: 'error', text: e.message }));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggleCollapse(key: string) {
    setCollapsed((p) => ({ ...p, [key]: !p[key] }));
  }

  // Group layanan: by kategori, then uncategorised
  const byKategori: Array<{ key: string; label: string; items: Layanan[] }> = [];

  kategoriList.forEach((k) => {
    const items = layananList.filter((l) => l.kategori_id === k.id);
    byKategori.push({ key: `k-${k.id}`, label: k.nama, items });
  });

  const tanpaKategori = layananList.filter((l) => !l.kategori_id);
  if (tanpaKategori.length > 0) {
    byKategori.push({ key: 'uncategorised', label: 'Tanpa Kategori', items: tanpaKategori });
  }

  // ── Delete Layanan ────────────────────────────────────────────────────────
  function handleDeleteLayanan(item: Layanan) {
    RNAlert.alert('Hapus Layanan', `Yakin ingin menghapus "${item.nama}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteLayanan(item.id);
            setMessage({ type: 'success', text: 'Layanan berhasil dihapus' });
            load();
          } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
          }
        },
      },
    ]);
  }

  // ── Delete Kategori ───────────────────────────────────────────────────────
  function handleDeleteKategori(k: Kategori) {
    RNAlert.alert(
      'Hapus Kategori',
      `Yakin ingin menghapus kategori "${k.nama}"?\nLayanan di dalamnya akan dipindah ke "Tanpa Kategori".`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteKategori(k.id);
              setMessage({ type: 'success', text: 'Kategori dihapus' });
              load();
            } catch (e: any) {
              setMessage({ type: 'error', text: e.message });
            }
          },
        },
      ]
    );
  }

  // ── Kategori Modal ────────────────────────────────────────────────────────
  function openAddKategori() {
    setModal({ open: true, editing: null, nama: '' });
    setModalError(null);
  }

  function openEditKategori(k: Kategori) {
    setModal({ open: true, editing: k, nama: k.nama });
    setModalError(null);
  }

  async function submitKategori() {
    if (!modal.nama.trim()) { setModalError('Nama kategori wajib diisi'); return; }
    setModalLoading(true);
    setModalError(null);
    try {
      if (modal.editing) {
        await api.updateKategori(modal.editing.id, modal.nama.trim());
      } else {
        await api.createKategori(modal.nama.trim(), kategoriList.length);
      }
      setModal({ open: false, editing: null, nama: '' });
      load();
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setModalLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      <Navbar adminName={admin?.nama_lengkap || admin?.username || ''} onLogout={logout} />
      <ScrollView>
        {/* Header row */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.title}>Kelola Layanan</Text>
            <Text style={styles.subtitle}>Daftar layanan administrasi desa yang tersedia di chatbot</Text>
          </View>
          <View style={styles.headerActions}>
            <Button title="+ Tambah Kategori" variant="secondary" onPress={openAddKategori} />
            <Button title="+ Tambah Layanan" onPress={() => router.push('/layanan/baru')} />
          </View>
        </View>

        {message && <Alert type={message.type} message={message.text} />}

        {/* Inline modal — kategori form */}
        {modal.open && (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modal.editing ? 'Edit Kategori' : 'Tambah Kategori'}</Text>
            {modalError && <Alert type="error" message={modalError} />}
            <Text style={styles.label}>Nama Kategori *</Text>
            <TextInput
              style={styles.input}
              value={modal.nama}
              onChangeText={(v) => setModal((p) => ({ ...p, nama: v }))}
              placeholder="Contoh: KTP, KK, Akta"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Button title={modal.editing ? 'Update' : 'Simpan'} onPress={submitKategori} disabled={modalLoading} />
              <Button
                title="Batal"
                variant="secondary"
                onPress={() => setModal({ open: false, editing: null, nama: '' })}
              />
            </View>
          </View>
        )}

        {/* Grouped layanan list */}
        {byKategori.length === 0 && layananList.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Belum ada layanan. Mulai dengan menambah kategori dan layanan.</Text>
            <Button title="Tambah Layanan Pertama" onPress={() => router.push('/layanan/baru')} />
          </View>
        ) : (
          byKategori.map((group) => {
            const isCollapsed = collapsed[group.key];
            const isUncategorised = group.key === 'uncategorised';

            return (
              <View key={group.key} style={styles.group}>
                {/* Group header */}
                <Pressable
                  style={styles.groupHeader}
                  onPress={() => toggleCollapse(group.key)}
                >
                  <View style={styles.groupHeaderLeft}>
                    <Text style={styles.groupChevron}>{isCollapsed ? '▶' : '▼'}</Text>
                    <Text style={styles.groupName}>{group.label}</Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{group.items.length} layanan</Text>
                    </View>
                  </View>
                  {!isUncategorised && (
                    <View style={styles.groupActions}>
                      {(() => {
                        const k = kategoriList.find((k) => `k-${k.id}` === group.key)!;
                        return (
                          <>
                            <Pressable style={styles.iconBtn} onPress={() => openEditKategori(k)}>
                              <Text style={styles.iconBtnText}>✏️</Text>
                            </Pressable>
                            <Pressable style={styles.iconBtn} onPress={() => handleDeleteKategori(k)}>
                              <Text style={styles.iconBtnText}>🗑️</Text>
                            </Pressable>
                          </>
                        );
                      })()}
                    </View>
                  )}
                </Pressable>

                {/* Layanan rows */}
                {!isCollapsed && (
                  <View style={styles.groupBody}>
                    {group.items.length === 0 ? (
                      <Text style={styles.emptyGroup}>Belum ada layanan dalam kategori ini.</Text>
                    ) : (
                      group.items.map((item) => (
                        <View key={item.id} style={styles.layananRow}>
                          <View style={styles.layananInfo}>
                            <Text style={styles.layananNama}>{item.nama}</Text>
                            <View style={styles.layananMeta}>
                              <Text style={styles.metaChip}>📋 {item.jumlah_syarat} syarat</Text>
                              {item.jumlah_sub_opsi > 0 && (
                                <Text style={styles.metaChipAccent}>🔀 {item.jumlah_sub_opsi} sub-opsi</Text>
                              )}
                            </View>
                          </View>
                          <View style={styles.layananActions}>
                            <Button
                              title="Edit"
                              variant="secondary"
                              size="sm"
                              onPress={() => router.push(`/layanan/${item.id}`)}
                            />
                            <Button
                              title="Hapus"
                              variant="danger"
                              size="sm"
                              onPress={() => handleDeleteLayanan(item)}
                            />
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 24,
    paddingHorizontal: 0,
  },
  title: { fontSize: 26, color: Colors.text, marginBottom: 8 },
  subtitle: { color: Colors.textMuted },
  headerActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  // Modal card
  modalCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 16 },
  label: { fontWeight: '500', color: Colors.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },

  // Empty state
  empty: { alignItems: 'center', padding: 40, gap: 16 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', fontSize: 15 },

  // Group
  group: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.bg,
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  groupChevron: { fontSize: 12, color: Colors.textMuted },
  groupName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  badge: {
    backgroundColor: Colors.infoBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, color: Colors.infoText, fontWeight: '600' },
  groupActions: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconBtnText: { fontSize: 14 },

  // Group body
  groupBody: { paddingHorizontal: 14, paddingBottom: 8 },
  emptyGroup: { color: Colors.textMuted, fontSize: 13, paddingVertical: 12, textAlign: 'center' },

  // Layanan row
  layananRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  layananInfo: { flex: 1 },
  layananNama: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  layananMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: { fontSize: 12, color: Colors.textMuted },
  metaChipAccent: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
  layananActions: { flexDirection: 'row', gap: 8 },
});
