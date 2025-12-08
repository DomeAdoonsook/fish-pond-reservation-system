require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// สร้าง data folder ถ้ายังไม่มี
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'fishpond.db');
const db = new Database(dbPath);

console.log('🐟 เริ่มต้นสร้างฐานข้อมูลระบบจองบ่อเลี้ยงปลา...\n');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- ตาราง admins (ผู้ดูแลระบบ)
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    line_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ตาราง ponds (บ่อเลี้ยงปลา)
  CREATE TABLE IF NOT EXISTS ponds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pond_code TEXT UNIQUE NOT NULL,
    zone TEXT NOT NULL,
    name TEXT,
    size TEXT,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'maintenance')),
    position_x REAL,
    position_y REAL,
    width REAL,
    height REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ตาราง reservations (การจองบ่อ)
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pond_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    line_user_id TEXT,
    fish_type TEXT NOT NULL,
    fish_quantity INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    purpose TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
    reject_reason TEXT,
    approved_by INTEGER,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(id),
    FOREIGN KEY (approved_by) REFERENCES admins(id)
  );

  -- ตาราง logs (ประวัติการใช้งาน)
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    pond_id INTEGER,
    reservation_id INTEGER,
    user_id TEXT,
    admin_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pond_id) REFERENCES ponds(id),
    FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    FOREIGN KEY (admin_id) REFERENCES admins(id)
  );

  -- ตาราง user_sessions (เก็บ state การสนทนา LINE)
  CREATE TABLE IF NOT EXISTS user_sessions (
    line_user_id TEXT PRIMARY KEY,
    state TEXT DEFAULT 'idle',
    data TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Index สำหรับ query ที่ใช้บ่อย
  CREATE INDEX IF NOT EXISTS idx_ponds_zone ON ponds(zone);
  CREATE INDEX IF NOT EXISTS idx_ponds_status ON ponds(status);
  CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
  CREATE INDEX IF NOT EXISTS idx_reservations_pond_id ON reservations(pond_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_line_user_id ON reservations(line_user_id);
`);

console.log('✅ สร้างตารางเรียบร้อย\n');

// สร้าง Admin เริ่มต้น
const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
const hashedPassword = bcrypt.hashSync(adminPassword, 10);

const insertAdmin = db.prepare(`
  INSERT OR IGNORE INTO admins (username, password, name)
  VALUES (?, ?, ?)
`);
insertAdmin.run('admin', hashedPassword, 'ผู้ดูแลระบบ');
console.log('✅ สร้าง Admin เริ่มต้น (username: admin)\n');

// ข้อมูลบ่อทั้งหมดตามผังภาพ - พร้อมตำแหน่ง (% ของภาพ)
const pondsData = [
  // โซน A - บ่อดินขนาดใหญ่ (บนซ้าย)
  { code: 'A1', zone: 'A', size: 'large', x: 44, y: 8, w: 14, h: 12 },
  { code: 'A2', zone: 'A', size: 'large', x: 35, y: 5, w: 5, h: 5 },
  { code: 'A3', zone: 'A', size: 'large', x: 14, y: 5, w: 10, h: 8 },
  { code: 'A4', zone: 'A', size: 'large', x: 4, y: 5, w: 8, h: 8 },

  // โซน B - บ่อดินขนาดกลาง
  { code: 'B1', zone: 'B', size: 'medium', x: 44, y: 22, w: 8, h: 8 },
  { code: 'B2', zone: 'B', size: 'medium', x: 36, y: 22, w: 8, h: 8 },
  { code: 'B3', zone: 'B', size: 'medium', x: 30, y: 22, w: 6, h: 6 },
  { code: 'B4', zone: 'B', size: 'medium', x: 24, y: 15, w: 6, h: 6 },
  { code: 'B5', zone: 'B', size: 'medium', x: 18, y: 15, w: 5, h: 5 },
  { code: 'B6', zone: 'B', size: 'medium', x: 12, y: 15, w: 5, h: 5 },
  { code: 'B7', zone: 'B', size: 'medium', x: 6, y: 15, w: 5, h: 5 },

  // โซน C - บ่อดินขนาดกลาง (แถวกลาง)
  { code: 'C1', zone: 'C', size: 'medium', x: 40, y: 32, w: 5, h: 5 },
  { code: 'C2', zone: 'C', size: 'medium', x: 35, y: 32, w: 5, h: 5 },
  { code: 'C3', zone: 'C', size: 'medium', x: 30, y: 32, w: 5, h: 5 },
  { code: 'C4', zone: 'C', size: 'medium', x: 25, y: 32, w: 5, h: 5 },
  { code: 'C5', zone: 'C', size: 'medium', x: 20, y: 32, w: 5, h: 5 },
  { code: 'C6', zone: 'C', size: 'medium', x: 10, y: 28, w: 8, h: 8 },
  { code: 'C7', zone: 'C', size: 'medium', x: 40, y: 40, w: 5, h: 5 },
  { code: 'C8', zone: 'C', size: 'medium', x: 35, y: 40, w: 5, h: 5 },
  { code: 'C9', zone: 'C', size: 'medium', x: 30, y: 40, w: 5, h: 5 },
  { code: 'C10', zone: 'C', size: 'medium', x: 25, y: 40, w: 5, h: 5 },
  { code: 'C11', zone: 'C', size: 'medium', x: 20, y: 40, w: 5, h: 5 },
  { code: 'C12', zone: 'C', size: 'medium', x: 15, y: 45, w: 5, h: 5 },
  { code: 'C13', zone: 'C', size: 'medium', x: 10, y: 45, w: 5, h: 5 },
  { code: 'C14', zone: 'C', size: 'medium', x: 5, y: 45, w: 5, h: 5 },

  // โซน D - บ่อดินขนาดกลาง (แถวล่าง)
  { code: 'D1', zone: 'D', size: 'medium', x: 40, y: 50, w: 5, h: 5 },
  { code: 'D2', zone: 'D', size: 'medium', x: 35, y: 50, w: 5, h: 5 },
  { code: 'D3', zone: 'D', size: 'medium', x: 30, y: 50, w: 5, h: 5 },
  { code: 'D4', zone: 'D', size: 'medium', x: 25, y: 50, w: 5, h: 5 },
  { code: 'D5', zone: 'D', size: 'medium', x: 20, y: 50, w: 5, h: 5 },
  { code: 'D6', zone: 'D', size: 'large', x: 35, y: 62, w: 12, h: 10 },

  // โซน E - บ่อในร่ม/คอนกรีต
  { code: 'E1', zone: 'E', size: 'small', x: 60, y: 58, w: 4, h: 4 },
  { code: 'E2', zone: 'E', size: 'small', x: 64, y: 58, w: 4, h: 4 },
  { code: 'E3', zone: 'E', size: 'small', x: 68, y: 58, w: 4, h: 4 },
  { code: 'E4', zone: 'E', size: 'small', x: 72, y: 55, w: 4, h: 4 },
  { code: 'E5', zone: 'E', size: 'small', x: 76, y: 55, w: 4, h: 4 },

  // โซน F - บ่อขนาดเล็ก (ขวาบน)
  { code: 'F1', zone: 'F', size: 'small', x: 55, y: 45, w: 4, h: 4 },
  { code: 'F2', zone: 'F', size: 'small', x: 55, y: 38, w: 4, h: 4 },
  { code: 'F3', zone: 'F', size: 'small', x: 55, y: 32, w: 4, h: 4 },
  { code: 'F4', zone: 'F', size: 'small', x: 55, y: 26, w: 4, h: 4 },
  { code: 'F5', zone: 'F', size: 'small', x: 55, y: 20, w: 4, h: 4 },
  { code: 'F6', zone: 'F', size: 'small', x: 60, y: 15, w: 4, h: 4 },
  { code: 'F7', zone: 'F', size: 'small', x: 64, y: 10, w: 4, h: 4 },
  { code: 'F8', zone: 'F', size: 'small', x: 60, y: 5, w: 4, h: 4 },

  // โซน G - บ่อขนาดเล็ก (ขวา)
  { code: 'G1', zone: 'G', size: 'small', x: 75, y: 12, w: 5, h: 5 },
  { code: 'G2', zone: 'G', size: 'medium', x: 72, y: 38, w: 8, h: 8 },
  { code: 'G3', zone: 'G', size: 'small', x: 82, y: 12, w: 4, h: 4 },
  { code: 'G4', zone: 'G', size: 'small', x: 82, y: 17, w: 4, h: 4 },
  { code: 'G5', zone: 'G', size: 'small', x: 82, y: 22, w: 4, h: 4 },
  { code: 'G6', zone: 'G', size: 'small', x: 82, y: 27, w: 4, h: 4 },
  { code: 'G7', zone: 'G', size: 'small', x: 82, y: 32, w: 4, h: 4 },
  { code: 'G8', zone: 'G', size: 'small', x: 82, y: 37, w: 4, h: 4 },
  { code: 'G10', zone: 'G', size: 'small', x: 85, y: 48, w: 4, h: 4 }
];

// Insert ponds
const insertPond = db.prepare(`
  INSERT OR IGNORE INTO ponds (pond_code, zone, size, position_x, position_y, width, height)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertPonds = db.transaction((ponds) => {
  for (const pond of ponds) {
    insertPond.run(pond.code, pond.zone, pond.size, pond.x, pond.y, pond.w, pond.h);
  }
});

insertPonds(pondsData);
console.log(`✅ เพิ่มข้อมูลบ่อทั้งหมด ${pondsData.length} บ่อ\n`);

// สรุปจำนวนบ่อแต่ละโซน
const zoneCounts = db.prepare(`
  SELECT zone, COUNT(*) as count FROM ponds GROUP BY zone ORDER BY zone
`).all();

console.log('📊 สรุปจำนวนบ่อแต่ละโซน:');
zoneCounts.forEach(z => {
  console.log(`   โซน ${z.zone}: ${z.count} บ่อ`);
});

const totalPonds = db.prepare('SELECT COUNT(*) as total FROM ponds').get();
console.log(`\n   รวมทั้งหมด: ${totalPonds.total} บ่อ`);

console.log('\n✅ สร้างฐานข้อมูลเสร็จสมบูรณ์!');
console.log('\n📝 ข้อมูล Admin สำหรับเข้าสู่ระบบ:');
console.log('   Username: admin');
console.log(`   Password: ${adminPassword}`);
console.log('\n⚠️  กรุณาเปลี่ยนรหัสผ่านหลังจากเข้าสู่ระบบครั้งแรก!');

db.close();
