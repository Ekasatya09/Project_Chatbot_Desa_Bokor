// ===== DASHBOARD SCRIPT =====

// Auto-hide alerts setelah 5 detik
document.addEventListener('DOMContentLoaded', function() {
  const alerts = document.querySelectorAll('.alert');
  
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s';
      alert.style.opacity = '0';
      setTimeout(() => {
        alert.remove();
      }, 500);
    }, 5000);
  });
});

// Konfirmasi sebelum hapus
function confirmDelete(message) {
  return confirm(message || 'Apakah Anda yakin ingin menghapus data ini?');
}

// Format tanggal Indonesia
function formatTanggalIndonesia(dateString) {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', options);
}

// Truncate text
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Smooth scroll to top
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Mobile menu toggle (jika diperlukan nanti)
function toggleMobileMenu() {
  const menu = document.querySelector('.navbar-menu');
  if (menu) {
    menu.classList.toggle('active');
  }
}

console.log('📊 Dashboard Chatbot Desa - Ready!');
