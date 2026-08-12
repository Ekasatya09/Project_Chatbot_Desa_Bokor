import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'db', 'desa.db');

console.log('🔍 Checking bot status in database...\n');

try {
  const db = new Database(DB_PATH);
  
  const botStatus = db.prepare('SELECT * FROM bot_status WHERE id = 1').get();
  
  if (!botStatus) {
    console.log('❌ No bot_status record found!');
    console.log('💡 Creating initial record...');
    db.prepare(`
      INSERT INTO bot_status (id, status, qr_string, wa_nomor, updated_at)
      VALUES (1, 'disconnected', NULL, NULL, CURRENT_TIMESTAMP)
    `).run();
    console.log('✅ Initial bot_status record created');
  } else {
    console.log('📊 Bot Status Record:');
    console.log('  ID:', botStatus.id);
    console.log('  Status:', botStatus.status);
    console.log('  Has QR String:', botStatus.qr_string ? 'YES (' + botStatus.qr_string.substring(0, 50) + '...)' : 'NO');
    console.log('  WA Nomor:', botStatus.wa_nomor || 'NULL');
    console.log('  Updated At:', botStatus.updated_at);
    
    if (botStatus.status === 'connecting' && !botStatus.qr_string) {
      console.log('\n⚠️  WARNING: Status is connecting but QR string is missing!');
      console.log('💡 This is the problem - bot-core.js is not saving QR to database');
    }
    
    if (botStatus.qr_string && botStatus.status === 'connecting') {
      console.log('\n✅ QR string exists! Frontend should be able to display it.');
    }
  }
  
  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
}
