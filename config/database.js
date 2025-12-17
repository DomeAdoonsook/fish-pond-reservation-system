const { createClient } = require('@libsql/client');

// สร้าง Turso client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/local.db',
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Schema SQL
const schemaSQL = `
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    line_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pond_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    line_user_id TEXT,
    phone TEXT,
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

  CREATE TABLE IF NOT EXISTS user_sessions (
    line_user_id TEXT PRIMARY KEY,
    state TEXT DEFAULT 'idle',
    data TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cancellation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL,
    reason TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    processed_by INTEGER,
    processed_at DATETIME,
    reject_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    FOREIGN KEY (processed_by) REFERENCES admins(id)
  );

  CREATE TABLE IF NOT EXISTS equipment_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'ชิ้น',
    description TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES equipment_categories(id)
  );

  CREATE TABLE IF NOT EXISTS equipment_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    line_user_id TEXT,
    phone TEXT,
    purpose TEXT,
    borrow_date DATE NOT NULL,
    return_date DATE NOT NULL,
    actual_return_date DATE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'borrowed', 'returned', 'cancelled', 'overdue')),
    reject_reason TEXT,
    approved_by INTEGER,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (approved_by) REFERENCES admins(id)
  );

  CREATE TABLE IF NOT EXISTS equipment_reservation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    returned_quantity INTEGER DEFAULT 0,
    FOREIGN KEY (reservation_id) REFERENCES equipment_reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
  );
`;

const indexSQL = `
  CREATE INDEX IF NOT EXISTS idx_ponds_zone ON ponds(zone);
  CREATE INDEX IF NOT EXISTS idx_ponds_status ON ponds(status);
  CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
  CREATE INDEX IF NOT EXISTS idx_reservations_pond_id ON reservations(pond_id);
  CREATE INDEX IF NOT EXISTS idx_reservations_line_user_id ON reservations(line_user_id);
  CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status);
  CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category_id);
  CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
  CREATE INDEX IF NOT EXISTS idx_eq_reservations_status ON equipment_reservations(status);
  CREATE INDEX IF NOT EXISTS idx_eq_reservations_line_user ON equipment_reservations(line_user_id);
  CREATE INDEX IF NOT EXISTS idx_eq_reservation_items_reservation ON equipment_reservation_items(reservation_id);
`;

// Initialize database
async function initDatabase() {
  try {
    // Create tables
    const statements = schemaSQL.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await db.execute(stmt);
      }
    }

    // Create indexes
    const indexes = indexSQL.split(';').filter(s => s.trim());
    for (const idx of indexes) {
      if (idx.trim()) {
        try {
          await db.execute(idx);
        } catch (e) {
          // Index might already exist
        }
      }
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = db;
module.exports.initDatabase = initDatabase;
