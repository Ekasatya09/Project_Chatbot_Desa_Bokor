import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'db', 'desa.db');

console.log('🔄 Force setting status to connecting...\n');

try {
  const db = new Database(DB_PATH);
  
  // Get current status
  const before = db.prepare('SELECT status, qr_string IS NOT NULL as has_qr FROM bot_status WHERE id = 1').get();
  console.log('Before:', before);
  
  // Keep QR string, just ensure status is connecting
  db.prepare(`
    UPDATE bot_status 
    SET status = 'connecting', updated_at = CURRENT_TIMESTAMP 
    WHERE id = 1
  `).run();
  
  const after = db.prepare('SELECT status, qr_string IS NOT NULL as has_qr FROM bot_status WHERE id = 1').get();
  console.log('After:', after);
  
  console.log('\n✅ Status set to connecting');
  console.log('💡 Now open http://localhost:3000/bot-status in browser');
  
  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
}
