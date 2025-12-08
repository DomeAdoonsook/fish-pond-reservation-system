const db = require('../config/database');

class Log {
  // บันทึก log
  static create(action, data = {}) {
    return db.prepare(`
      INSERT INTO logs (action, pond_id, reservation_id, user_id, admin_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      action,
      data.pond_id || null,
      data.reservation_id || null,
      data.user_id || null,
      data.admin_id || null,
      data.details ? JSON.stringify(data.details) : null
    );
  }

  // ดึง log ทั้งหมด
  static getAll(limit = 100) {
    return db.prepare(`
      SELECT l.*,
        p.pond_code,
        a.name as admin_name
      FROM logs l
      LEFT JOIN ponds p ON l.pond_id = p.id
      LEFT JOIN admins a ON l.admin_id = a.id
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  // ดึง log ตามบ่อ
  static getByPondId(pondId, limit = 50) {
    return db.prepare(`
      SELECT l.*,
        a.name as admin_name
      FROM logs l
      LEFT JOIN admins a ON l.admin_id = a.id
      WHERE l.pond_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(pondId, limit);
  }

  // ดึง log ตามการจอง
  static getByReservationId(reservationId) {
    return db.prepare(`
      SELECT l.*,
        p.pond_code,
        a.name as admin_name
      FROM logs l
      LEFT JOIN ponds p ON l.pond_id = p.id
      LEFT JOIN admins a ON l.admin_id = a.id
      WHERE l.reservation_id = ?
      ORDER BY l.created_at DESC
    `).all(reservationId);
  }
}

module.exports = Log;
