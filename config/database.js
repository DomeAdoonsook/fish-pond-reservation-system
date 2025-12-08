const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'fishpond.db');
const db = new Database(dbPath);

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

module.exports = db;
