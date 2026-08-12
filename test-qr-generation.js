import Database from 'better-sqlite3';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'db', 'desa.db');

console.log('🧪 Testing QR Code Generation...\n');

async function testQRGeneration() {
  try {
    const db = new Database(DB_PATH);
    
    const botRow = db.prepare('SELECT qr_string, status FROM bot_status WHERE id = 1').get();
    
    if (!botRow) {
      console.log('❌ No bot_status record found!');
      return;
    }
    
    console.log('📊 Status:', botRow.status);
    console.log('📊 QR String:', botRow.qr_string ? botRow.qr_string.substring(0, 50) + '...' : 'NULL');
    
    if (!botRow.qr_string) {
      console.log('❌ No QR string in database!');
      return;
    }
    
    if (botRow.status !== 'connecting') {
      console.log('⚠️  Status is not connecting:', botRow.status);
    }
    
    console.log('\n🔄 Attempting to generate QR code...');
    
    try {
      const startTime = Date.now();
      
      const qrDataUrl = await QRCode.toDataURL(botRow.qr_string, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e293b', light: '#ffffff' }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ QR code generated successfully in ${duration}ms`);
      console.log(`📏 Data URL length: ${qrDataUrl.length} characters`);
      console.log(`📝 Data URL prefix: ${qrDataUrl.substring(0, 50)}...`);
      
      if (qrDataUrl.startsWith('data:image/png;base64,')) {
        console.log('✅ Valid PNG data URL format');
      } else {
        console.log('⚠️  Unexpected data URL format');
      }
      
    } catch (qrError) {
      console.error('❌ QR Generation Error:', qrError.message);
      console.error('   Stack:', qrError.stack);
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testQRGeneration();
