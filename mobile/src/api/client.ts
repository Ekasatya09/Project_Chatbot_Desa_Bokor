import { Platform } from 'react-native';

// Di web: origin yang sama (relatif) atau EXPO_PUBLIC_API_URL untuk dev terpisah
const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let body: any = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.error || `Permintaan gagal (${response.status})`);
  }

  return body as T;
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  login: (username: string, password: string) =>
    request<{ admin: AdminData }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/logout', { method: 'POST' }),

  me: () => request<{ admin: AdminData }>('/api/me'),

  stats: () => request<StatsDashboard>('/api/stats'),

  // ── Kategori ──────────────────────────────────────────────────────────────────
  kategoriList: () =>
    request<{ kategoriList: KategoriData[] }>('/api/kategori'),

  createKategori: (nama: string, urutan?: number) =>
    request<{ id: number }>('/api/kategori', {
      method: 'POST',
      body: JSON.stringify({ nama, urutan: urutan ?? 0 }),
    }),

  updateKategori: (id: number | string, nama: string, urutan?: number) =>
    request<{ ok: boolean }>(`/api/kategori/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ nama, urutan: urutan ?? 0 }),
    }),

  deleteKategori: (id: number | string) =>
    request<{ ok: boolean }>(`/api/kategori/${id}`, { method: 'DELETE' }),

  // ── Layanan ───────────────────────────────────────────────────────────────────
  layananList: () => request<{ layananList: LayananData[] }>('/api/layanan'),

  layananDetail: (id: number | string) =>
    request<{ layanan: LayananDetail; syaratList: SyaratData[]; subOpsiList: SubOpsiData[] }>(`/api/layanan/${id}`),

  createLayanan: (
    nama: string,
    syarat: string[],
    kategori_id?: number | null,
    sub_opsi?: SubOpsiDraftData[]
  ) =>
    request<{ id: number }>('/api/layanan', {
      method: 'POST',
      body: JSON.stringify({ nama, syarat, kategori_id: kategori_id ?? null, sub_opsi: sub_opsi ?? [] }),
    }),

  updateLayanan: (
    id: number | string,
    nama: string,
    syarat: string[],
    kategori_id?: number | null,
    sub_opsi?: SubOpsiDraftData[]
  ) =>
    request<{ ok: boolean }>(`/api/layanan/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ nama, syarat, kategori_id: kategori_id ?? null, sub_opsi: sub_opsi ?? [] }),
    }),

  deleteLayanan: (id: number) =>
    request<{ ok: boolean }>(`/api/layanan/${id}`, { method: 'DELETE' }),

  // ── Riwayat & Statistik ───────────────────────────────────────────────────────
  riwayat: (params: {
    page?: number;
    limit?: number;
    tanggal_mulai?: string;
    tanggal_selesai?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') qs.set(key, String(value));
    });
    const query = qs.toString();
    return request<RiwayatData>(`/api/riwayat${query ? `?${query}` : ''}`);
  },

  statistik: () => request<StatistikData>('/api/statistik'),

  // ── Bot WhatsApp (QR connect) ──────────────────────────────────────────────
  botStatus: () =>
    request<{ status: string; wa_nomor: string | null; updated_at: string | null }>(
      '/api/bot/status'
    ),

  botConnect: () =>
    request<{ ok: boolean; error?: string; message?: string }>('/api/bot/connect', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  botQR: () =>
    request<{ qr: string | null; status: string }>('/api/bot/qr'),
};

// Re-export types for convenience
export type AdminData       = import('./types').Admin;
export type KategoriData    = import('./types').Kategori;
export type LayananData     = import('./types').Layanan;
export type LayananDetail   = import('./types').Layanan & { jumlah_syarat?: number; jumlah_sub_opsi?: number };
export type SyaratData      = import('./types').Syarat;
export type SubOpsiData     = import('./types').SubOpsi;
export type SubOpsiDraftData = import('./types').SubOpsiDraft;
export type StatsDashboard  = import('./types').StatsDashboard;
export type RiwayatData     = import('./types').RiwayatResponse;
export type StatistikData   = import('./types').Statistik;
