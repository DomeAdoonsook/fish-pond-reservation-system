const db = require('../config/database');

class Pond {
  // ดึงบ่อทั้งหมด
  static getAll() {
    return db.prepare(`
      SELECT p.*,
        r.user_name,
        r.fish_type,
        r.fish_quantity,
        r.start_date,
        r.end_date,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days
      FROM ponds p
      LEFT JOIN reservations r ON p.id = r.pond_id
        AND r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
      ORDER BY p.zone, p.pond_code
    `).all();
  }

  // ดึงบ่อตาม ID
  static getById(id) {
    return db.prepare(`
      SELECT p.*,
        r.id as reservation_id,
        r.user_name,
        r.fish_type,
        r.fish_quantity,
        r.start_date,
        r.end_date,
        r.purpose,
        r.line_user_id,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days
      FROM ponds p
      LEFT JOIN reservations r ON p.id = r.pond_id
        AND r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
      WHERE p.id = ?
    `).get(id);
  }

  // ดึงบ่อตาม code
  static getByCode(code) {
    return db.prepare(`
      SELECT p.*,
        r.id as reservation_id,
        r.user_name,
        r.fish_type,
        r.fish_quantity,
        r.start_date,
        r.end_date,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days
      FROM ponds p
      LEFT JOIN reservations r ON p.id = r.pond_id
        AND r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
      WHERE p.pond_code = ?
    `).get(code);
  }

  // ดึงบ่อตามโซน
  static getByZone(zone) {
    return db.prepare(`
      SELECT p.*,
        r.user_name,
        r.fish_type,
        r.fish_quantity,
        r.start_date,
        r.end_date,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days
      FROM ponds p
      LEFT JOIN reservations r ON p.id = r.pond_id
        AND r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
      WHERE p.zone = ?
      ORDER BY p.pond_code
    `).all(zone);
  }

  // ดึงบ่อว่าง
  static getAvailable() {
    return db.prepare(`
      SELECT p.*
      FROM ponds p
      WHERE p.status = 'available'
        AND p.id NOT IN (
          SELECT pond_id FROM reservations
          WHERE status IN ('approved', 'pending')
            AND date('now') <= end_date
        )
      ORDER BY p.zone, p.pond_code
    `).all();
  }

  // ดึงบ่อว่างตามโซน
  static getAvailableByZone(zone) {
    return db.prepare(`
      SELECT p.*
      FROM ponds p
      WHERE p.status = 'available'
        AND p.zone = ?
        AND p.id NOT IN (
          SELECT pond_id FROM reservations
          WHERE status IN ('approved', 'pending')
            AND date('now') <= end_date
        )
      ORDER BY p.pond_code
    `).all(zone);
  }

  // นับสถานะบ่อ
  static getStatusCount() {
    const total = db.prepare('SELECT COUNT(*) as count FROM ponds').get().count;

    const occupied = db.prepare(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM ponds p
      INNER JOIN reservations r ON p.id = r.pond_id
      WHERE r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
    `).get().count;

    const pending = db.prepare(`
      SELECT COUNT(DISTINCT pond_id) as count
      FROM reservations
      WHERE status = 'pending'
    `).get().count;

    const maintenance = db.prepare(`
      SELECT COUNT(*) as count FROM ponds WHERE status = 'maintenance'
    `).get().count;

    const available = total - occupied - maintenance;

    return {
      total,
      available: available - pending, // หักบ่อที่รอพิจารณา
      occupied,
      pending,
      maintenance
    };
  }

  // นับบ่อว่างตามโซน
  static getAvailableCountByZone() {
    return db.prepare(`
      SELECT
        p.zone,
        COUNT(*) as total,
        SUM(CASE
          WHEN p.status = 'available'
            AND p.id NOT IN (
              SELECT pond_id FROM reservations
              WHERE status IN ('approved', 'pending')
                AND date('now') <= end_date
            )
          THEN 1 ELSE 0
        END) as available
      FROM ponds p
      GROUP BY p.zone
      ORDER BY p.zone
    `).all();
  }

  // อัพเดทสถานะบ่อ
  static updateStatus(id, status) {
    return db.prepare(`
      UPDATE ponds SET status = ? WHERE id = ?
    `).run(status, id);
  }

  // ดึงโซนทั้งหมด
  static getZones() {
    return db.prepare(`
      SELECT DISTINCT zone FROM ponds ORDER BY zone
    `).all().map(row => row.zone);
  }

  // อัพเดทตำแหน่งบ่อ
  static updatePosition(pondCode, left, top, width, height) {
    return db.prepare(`
      UPDATE ponds
      SET position_x = ?, position_y = ?, width = ?, height = ?
      WHERE pond_code = ?
    `).run(left, top, width, height, pondCode);
  }

  // ดึงตำแหน่งบ่อทั้งหมด
  static getPositions() {
    const ponds = db.prepare(`
      SELECT pond_code, position_x, position_y, width, height
      FROM ponds
      WHERE position_x IS NOT NULL
    `).all();

    const positions = {};
    ponds.forEach(p => {
      if (p.position_x !== null) {
        positions[p.pond_code] = {
          left: p.position_x,
          top: p.position_y,
          width: p.width,
          height: p.height
        };
      }
    });
    return positions;
  }
}

module.exports = Pond;
