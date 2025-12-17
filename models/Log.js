const db = require('../config/database');

class Log {
  // บันทึก log
  static async create(action, data = {}) {
    return await db.execute({
      sql: `INSERT INTO logs (action, pond_id, reservation_id, user_id, admin_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        action,
        data.pond_id || null,
        data.reservation_id || null,
        data.user_id || null,
        data.admin_id || null,
        data.details ? JSON.stringify(data.details) : null
      ]
    });
  }

  // ดึง log ทั้งหมด
  static async getAll(limit = 100) {
    const result = await db.execute({
      sql: `SELECT l.*, p.pond_code, a.name as admin_name
            FROM logs l
            LEFT JOIN ponds p ON l.pond_id = p.id
            LEFT JOIN admins a ON l.admin_id = a.id
            ORDER BY l.created_at DESC
            LIMIT ?`,
      args: [limit]
    });
    return result.rows;
  }

  // ดึง log ตามบ่อ
  static async getByPondId(pondId, limit = 50) {
    const result = await db.execute({
      sql: `SELECT l.*, a.name as admin_name
            FROM logs l
            LEFT JOIN admins a ON l.admin_id = a.id
            WHERE l.pond_id = ?
            ORDER BY l.created_at DESC
            LIMIT ?`,
      args: [pondId, limit]
    });
    return result.rows;
  }

  // ดึง log ตามการจอง
  static async getByReservationId(reservationId) {
    const result = await db.execute({
      sql: `SELECT l.*, p.pond_code, a.name as admin_name
            FROM logs l
            LEFT JOIN ponds p ON l.pond_id = p.id
            LEFT JOIN admins a ON l.admin_id = a.id
            WHERE l.reservation_id = ?
            ORDER BY l.created_at DESC`,
      args: [reservationId]
    });
    return result.rows;
  }
}

module.exports = Log;
