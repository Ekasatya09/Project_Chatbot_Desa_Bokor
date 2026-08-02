// ===== Format tanggal ala EJS toLocaleString('id-ID') =====

export function formatTanggalWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID');
}

export function formatTanggal(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('id-ID');
}

export function formatTanggalPanjang(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatWaktuSingkat(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
