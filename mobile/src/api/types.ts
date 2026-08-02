// ===== Tipe data API =====

export interface Admin {
  id: number;
  username: string;
  nama_lengkap: string | null;
}

export interface Kategori {
  id: number;
  nama: string;
  urutan: number;
  jumlah_layanan: number;
  created_at?: string;
}

export interface SyaratSubOpsi {
  id: number;
  sub_opsi_id: number;
  deskripsi: string;
  urutan: number;
}

export interface SubOpsi {
  id: number;
  layanan_id: number;
  nama: string;
  urutan: number;
  syaratList: SyaratSubOpsi[];
  created_at?: string;
}

// Draft sub-opsi (belum tersimpan, pakai string[] untuk syarat)
export interface SubOpsiDraft {
  nama: string;
  syaratList: string[];
}

export interface Syarat {
  id: number;
  layanan_id: number;
  deskripsi: string;
  urutan: number;
  created_at?: string;
}

export interface Layanan {
  id: number;
  nama: string;
  kategori_id: number | null;
  kategori_nama: string | null;
  created_at: string;
  updated_at: string;
  jumlah_syarat: number;
  jumlah_sub_opsi: number;
}

export interface TopLayanan {
  nama: string;
  jumlah: number;
}

export interface ChatTerbaru {
  id: number;
  nomor_wa: string;
  pesan_masuk: string;
  waktu: string;
  layanan_nama: string | null;
}

export interface StatsDashboard {
  totalLayanan: number;
  totalChat: number;
  totalChatHariIni: number;
  topLayanan: TopLayanan[];
  chatTerbaru: ChatTerbaru[];
}

export interface RiwayatChat extends ChatTerbaru {
  balasan_bot: string;
}

export interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

export interface RiwayatResponse {
  riwayatList: RiwayatChat[];
  pagination: Pagination;
  filter: {
    tanggalMulai: string;
    tanggalSelesai: string;
  };
}

export interface StatPerLayanan {
  nama: string;
  jumlah_pertanyaan: number;
  pertama_ditanya: string | null;
  terakhir_ditanya: string | null;
}

export interface StatPerHari {
  tanggal: string;
  jumlah: number;
}

export interface Statistik {
  statsPerLayanan: StatPerLayanan[];
  statsPerHari: StatPerHari[];
  totalUnikWA: number;
}

