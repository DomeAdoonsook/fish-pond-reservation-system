const db = require('../config/database');

class Pond {
  // ดึงบ่อทั้งหมด
  static async getAll() {
    const result = await db.execute(`
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
    `);
    return result.rows;
  }

  // ดึงบ่อตาม ID (รวมการจองที่อนุมัติแล้วแม้ยังไม่ถึงวันเริ่มต้น)
  static async getById(id) {
    const result = await db.execute({
      sql: `
        SELECT p.*,
          r.id as reservation_id,
          r.user_name,
          r.fish_type,
          r.fish_quantity,
          r.start_date,
          r.end_date,
          r.purpose,
          r.line_user_id,
          r.status as reservation_status,
          CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days,
          CASE WHEN date('now') >= r.start_date THEN 1 ELSE 0 END as is_active
        FROM ponds p
        LEFT JOIN reservations r ON p.id = r.pond_id
          AND r.status = 'approved'
          AND date('now') <= r.end_date
        WHERE p.id = ?
      `,
      args: [id]
    });
    return result.rows[0] || null;
  }

  // ดึงบ่อตาม code
  static async getByCode(code) {
    const result = await db.execute({
      sql: `
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
      `,
      args: [code]
    });
    return result.rows[0] || null;
  }

  // ดึงบ่อตามโซน
  static async getByZone(zone) {
    const result = await db.execute({
      sql: `
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
      `,
      args: [zone]
    });
    return result.rows;
  }

  // ดึงบ่อว่าง
  static async getAvailable() {
    const result = await db.execute(`
      SELECT p.*
      FROM ponds p
      WHERE p.status = 'available'
        AND p.id NOT IN (
          SELECT pond_id FROM reservations
          WHERE status IN ('approved', 'pending')
            AND date('now') <= end_date
        )
      ORDER BY p.zone, p.pond_code
    `);
    return result.rows;
  }

  // ดึงบ่อว่างตามโซน
  static async getAvailableByZone(zone) {
    const result = await db.execute({
      sql: `
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
      `,
      args: [zone]
    });
    return result.rows;
  }

  // นับสถานะบ่อ
  static async getStatusCount() {
    const totalResult = await db.execute('SELECT COUNT(*) as count FROM ponds');
    const total = Number(totalResult.rows[0].count);

    const occupiedResult = await db.execute(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM ponds p
      INNER JOIN reservations r ON p.id = r.pond_id
      WHERE r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
    `);
    const occupied = Number(occupiedResult.rows[0].count);

    const pendingResult = await db.execute(`
      SELECT COUNT(DISTINCT pond_id) as count
      FROM reservations
      WHERE status = 'pending'
    `);
    const pending = Number(pendingResult.rows[0].count);

    const maintenanceResult = await db.execute(`
      SELECT COUNT(*) as count FROM ponds WHERE status = 'maintenance'
    `);
    const maintenance = Number(maintenanceResult.rows[0].count);

    const available = total - occupied - maintenance;

    return {
      total,
      available: available - pending,
      occupied,
      pending,
      maintenance
    };
  }

  // นับบ่อว่างตามโซน
  static async getAvailableCountByZone() {
    const result = await db.execute(`
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
    `);
    return result.rows;
  }

  // อัพเดทสถานะบ่อ
  static async updateStatus(id, status) {
    return await db.execute({
      sql: 'UPDATE ponds SET status = ? WHERE id = ?',
      args: [status, id]
    });
  }

  // ดึงโซนทั้งหมด
  static async getZones() {
    const result = await db.execute('SELECT DISTINCT zone FROM ponds ORDER BY zone');
    return result.rows.map(row => row.zone);
  }

  // อัพเดทตำแหน่งบ่อ
  static async updatePosition(pondCode, left, top, width, height) {
    return await db.execute({
      sql: 'UPDATE ponds SET position_x = ?, position_y = ?, width = ?, height = ? WHERE pond_code = ?',
      args: [left, top, width, height, pondCode]
    });
  }

  // ดึงตำแหน่งบ่อทั้งหมด
  static async getPositions() {
    const result = await db.execute(`
      SELECT pond_code, position_x, position_y, width, height
      FROM ponds
      WHERE position_x IS NOT NULL
    `);

    const positions = {};
    result.rows.forEach(p => {
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
