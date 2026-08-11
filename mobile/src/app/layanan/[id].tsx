import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Kategori, SubOpsiDraft } from '@/api/types';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Navbar } from '@/components/Navbar';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/theme';

export default function LayananFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { admin, logout } = useAuth();

  const isEdit = id && id !== 'baru';

  // Form state
  const [nama, setNama] = useState('');
  const [kategoriId, setKategoriId] = useState<number | null>(null);
  const [syaratList, setSyaratList] = useState<string[]>(['']);
  const [subOpsiList, setSubOpsiList] = useState<SubOpsiDraft[]>([]);

  // UI state
  const [kategoriOptions, setKategoriOptions] = useState<Kategori[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showKategoriPicker, setShowKategoriPicker] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api.kategoriList().then((r) => setKategoriOptions(r.kategoriList)).catch(() => { });
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.layananDetail(id).then((res) => {
      setNama(res.layanan.nama);
      setKategoriId(res.layanan.kategori_id);
      setSyaratList(res.syaratList.length > 0 ? res.syaratList.map((s) => s.deskripsi) : ['']);
      setSubOpsiList(
        res.subOpsiList.map((so) => ({
          nama: so.nama,
          syaratList: so.syaratList.length > 0 ? so.syaratList.map((s) => s.deskripsi) : [''],
        }))
      );
    }).catch((e) => setError(e.message));
  }, [isEdit, id]);

  // ── Syarat Umum helpers ───────────────────────────────────────────────────
  const addSyarat = () => setSyaratList((p) => [...p, '']);
  const removeSyarat = (i: number) => {
    if (syaratList.length <= 1) { setError('Minimal harus ada 1 syarat'); return; }
    setSyaratList((p) => p.filter((_, idx) => idx !== i));
    setError(null);
  };
  const updateSyarat = (i: number, v: string) =>
    setSyaratList((p) => p.map((s, idx) => (idx === i ? v : s)));

  // ── Sub-opsi helpers ──────────────────────────────────────────────────────
  const addSubOpsi = () =>
    setSubOpsiList((p) => [...p, { nama: '', syaratList: [''] }]);

  const removeSubOpsi = (i: number) =>
    setSubOpsiList((p) => p.filter((_, idx) => idx !== i));

  const updateSubOpsiNama = (i: number, v: string) =>
    setSubOpsiList((p) => p.map((so, idx) => idx === i ? { ...so, nama: v } : so));

  const addSyaratSubOpsi = (soIdx: number) =>
    setSubOpsiList((p) =>
      p.map((so, idx) => idx === soIdx ? { ...so, syaratList: [...so.syaratList, ''] } : so)
    );

  const removeSyaratSubOpsi = (soIdx: number, sIdx: number) =>
    setSubOpsiList((p) =>
      p.map((so, idx) => {
        if (idx !== soIdx) return so;
        if (so.syaratList.length <= 1) return so;
        return { ...so, syaratList: so.syaratList.filter((_, i) => i !== sIdx) };
      })
    );

  const updateSyaratSubOpsi = (soIdx: number, sIdx: number, v: string) =>
    setSubOpsiList((p) =>
      p.map((so, idx) =>
        idx === soIdx
          ? { ...so, syaratList: so.syaratList.map((s, i) => (i === sIdx ? v : s)) }
          : so
      )
    );

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!nama.trim()) { setError('Nama layanan wajib diisi'); return; }

    const syaratBersih = syaratList.filter((s) => s.trim());

    // Validate sub-opsi: semua harus punya nama
    for (const so of subOpsiList) {
      if (!so.nama.trim()) { setError('Nama sub-opsi tidak boleh kosong'); return; }
    }

    const subOpsiBersih = subOpsiList.map((so) => ({
      nama: so.nama.trim(),
      syaratList: so.syaratList.filter((s) => s.trim()),
    }));

    setLoading(true);
    setError(null);
    try {
      if (isEdit) {
        await api.updateLayanan(id, nama.trim(), syaratBersih, kategoriId, subOpsiBersih);
      } else {
        await api.createLayanan(nama.trim(), syaratBersih, kategoriId, subOpsiBersih);
      }
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedKategori = kategoriOptions.find((k) => k.id === kategoriId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      <Navbar adminName={admin?.nama_lengkap || admin?.username || ''} onLogout={logout} />
      <ScrollView>
        <Text style={styles.title}>{isEdit ? 'Edit Layanan' : 'Tambah Layanan'}</Text>
        <Text style={styles.backLink} onPress={() => router.back()}>← Kembali ke Daftar Layanan</Text>

        {error && <Alert type="error" message={error} />}

        <View style={styles.form}>
          {/* ── Nama ── */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Nama Layanan *</Text>
            <TextInput
              style={styles.input}
              value={nama}
              onChangeText={setNama}
              placeholder="Contoh: Buat KTP Baru"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* ── Kategori ── */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Kategori (Opsional)</Text>
            <Text style={styles.help}>Pilih kategori untuk mengelompokkan layanan ini.</Text>
            <Pressable
              style={styles.pickerBtn}
              onPress={() => setShowKategoriPicker((p) => !p)}
            >
              <Text style={selectedKategori ? styles.pickerSelected : styles.pickerPlaceholder}>
                {selectedKategori ? selectedKategori.nama : 'Pilih kategori...'}
              </Text>
              <Text style={styles.pickerChevron}>{showKategoriPicker ? '▲' : '▼'}</Text>
            </Pressable>

            {showKategoriPicker && (
              <View style={styles.pickerDropdown}>
                <Pressable
                  style={[styles.pickerOption, !kategoriId && styles.pickerOptionActive]}
                  onPress={() => { setKategoriId(null); setShowKategoriPicker(false); }}
                >
                  <Text style={!kategoriId ? styles.pickerOptionTextActive : styles.pickerOptionText}>
                    — Tanpa Kategori —
                  </Text>
                </Pressable>
                {kategoriOptions.map((k) => (
                  <Pressable
                    key={k.id}
                    style={[styles.pickerOption, kategoriId === k.id && styles.pickerOptionActive]}
                    onPress={() => { setKategoriId(k.id); setShowKategoriPicker(false); }}
                  >
                    <Text style={kategoriId === k.id ? styles.pickerOptionTextActive : styles.pickerOptionText}>
                      {k.nama}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* ── Syarat Umum ── */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Syarat-syarat Umum</Text>
            <Text style={styles.help}>
              Syarat yang berlaku untuk semua sub-opsi (jika ada), atau syarat utama layanan ini.
            </Text>
            {syaratList.map((s, i) => (
              <View key={i} style={styles.syaratRow}>
                <Text style={styles.syaratNumber}>{i + 1}.</Text>
                <TextInput
                  style={styles.inputFlex}
                  value={s}
                  onChangeText={(v) => updateSyarat(i, v)}
                  placeholder="Masukkan syarat"
                  placeholderTextColor="#9ca3af"
                />
                <Button title="×" variant="danger" size="sm" onPress={() => removeSyarat(i)} />
              </View>
            ))}
            <View style={styles.addRow}>
              <Button title="+ Tambah Syarat" variant="secondary" onPress={addSyarat} />
            </View>
          </View>

          {/* ── Sub-opsi ── */}
          <View style={styles.formGroup}>
            <View style={styles.subOpsiHeader}>
              <View>
                <Text style={styles.label}>Sub-opsi (Opsional)</Text>
                <Text style={styles.help}>
                  Tambahkan sub-opsi jika layanan ini memiliki alasan/jenis yang berbeda,{'\n'}
                  misalnya: "Karena hilang", "Karena baru masuk umur".
                </Text>
              </View>
            </View>

            {subOpsiList.map((so, soIdx) => (
              <View key={soIdx} style={styles.subOpsiCard}>
                <View style={styles.subOpsiTitleRow}>
                  <Text style={styles.subOpsiIndex}>Sub-opsi {soIdx + 1}</Text>
                  <Pressable onPress={() => removeSubOpsi(soIdx)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>Hapus</Text>
                  </Pressable>
                </View>

                <Text style={styles.labelSm}>Nama Sub-opsi *</Text>
                <TextInput
                  style={styles.input}
                  value={so.nama}
                  onChangeText={(v) => updateSubOpsiNama(soIdx, v)}
                  placeholder="Contoh: Karena hilang"
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.labelSm}>Syarat Khusus Sub-opsi</Text>
                {so.syaratList.map((s, sIdx) => (
                  <View key={sIdx} style={styles.syaratRow}>
                    <Text style={styles.syaratNumber}>{sIdx + 1}.</Text>
                    <TextInput
                      style={styles.inputFlex}
                      value={s}
                      onChangeText={(v) => updateSyaratSubOpsi(soIdx, sIdx, v)}
                      placeholder="Masukkan syarat khusus"
                      placeholderTextColor="#9ca3af"
                    />
                    <Button title="×" variant="danger" size="sm" onPress={() => removeSyaratSubOpsi(soIdx, sIdx)} />
                  </View>
                ))}
                <Button title="+ Syarat" variant="secondary" size="sm" onPress={() => addSyaratSubOpsi(soIdx)} />
              </View>
            ))}

            <View style={styles.addRow}>
              <Button title="+ Tambah Sub-opsi" variant="secondary" onPress={addSubOpsi} />
            </View>
          </View>

          {/* ── Actions ── */}
          <View style={styles.formActions}>
            <Button title={isEdit ? 'Update Layanan' : 'Simpan Layanan'} onPress={handleSubmit} disabled={loading} />
            <Button title="Batal" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, color: Colors.text, marginBottom: 8 },
  backLink: { color: Colors.primary, marginBottom: 24 },
  form: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 24,
    marginBottom: 40,
  },
  formGroup: { marginBottom: 28 },
  label: { fontWeight: '600', color: Colors.text, marginBottom: 8, fontSize: 14 },
  labelSm: { fontWeight: '500', color: Colors.text, marginBottom: 6, fontSize: 13 },
  help: { fontSize: 13, color: Colors.textMuted, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  inputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },

  // Picker
  pickerBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  pickerPlaceholder: { color: Colors.textMuted, fontSize: 14 },
  pickerSelected: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  pickerChevron: { color: Colors.textMuted, fontSize: 12 },
  pickerDropdown: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    marginTop: 4,
    backgroundColor: Colors.card,
    overflow: 'hidden',
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerOptionActive: { backgroundColor: Colors.infoBg },
  pickerOptionText: { fontSize: 14, color: Colors.text },
  pickerOptionTextActive: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  // Syarat row
  syaratRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  syaratNumber: { fontWeight: '600', color: Colors.textMuted, minWidth: 24 },
  addRow: { marginTop: 4 },

  // Sub-opsi
  subOpsiHeader: { marginBottom: 4 },
  subOpsiCard: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  subOpsiTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subOpsiIndex: { fontWeight: '700', color: Colors.primary, fontSize: 14 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.errorBg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
  },
  removeBtnText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },

  formActions: { flexDirection: 'row', gap: 16, marginTop: 8, flexWrap: 'wrap' },
});
