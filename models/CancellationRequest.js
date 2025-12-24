const db = require('../config/database');

class CancellationRequest {
  // สร้างคำขอยกเลิกใหม่
  static async create(data) {
    const result = await db.execute({
      sql: `INSERT INTO cancellation_requests (reservation_id, reason, phone) VALUES (?, ?, ?)`,
      args: [data.reservation_id, data.reason || null, data.phone || null]
    });
    return Number(result.lastInsertRowid);
  }

  // ดึงคำขอยกเลิกทั้งหมด
  static async getAll() {
    const result = await db.execute(`
      SELECT cr.*,
        r.pond_id, r.user_name, r.fish_type, r.fish_quantity, r.start_date, r.end_date, r.line_user_id,
        p.pond_code, p.zone,
        a.name as processed_by_name
      FROM cancellation_requests cr
      JOIN reservations r ON cr.reservation_id = r.id
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON cr.processed_by = a.id
      ORDER BY cr.created_at DESC
    `);
    return result.rows;
  }

  // ดึงคำขอยกเลิกตาม ID
  static async getById(id) {
    const result = await db.execute({
      sql: `SELECT cr.*,
              r.pond_id, r.user_name, r.fish_type, r.fish_quantity, r.start_date, r.end_date, r.line_user_id,
              p.pond_code, p.zone,
              a.name as processed_by_name
            FROM cancellation_requests cr
            JOIN reservations r ON cr.reservation_id = r.id
            JOIN ponds p ON r.pond_id = p.id
            LEFT JOIN admins a ON cr.processed_by = a.id
            WHERE cr.id = ?`,
      args: [id]
    });
    return result.rows[0] || null;
  }

  // ดึงคำขอยกเลิกที่รอดำเนินการ
  static async getPending() {
    const result = await db.execute(`
      SELECT cr.*,
        r.pond_id, r.user_name, r.fish_type, r.fish_quantity, r.start_date, r.end_date, r.line_user_id,
        p.pond_code, p.zone
      FROM cancellation_requests cr
      JOIN reservations r ON cr.reservation_id = r.id
      JOIN ponds p ON r.pond_id = p.id
      WHERE cr.status = 'pending'
      ORDER BY cr.created_at ASC
    `);
    return result.rows;
  }

  // ตรวจสอบว่ามีคำขอยกเลิกที่รอดำเนินการอยู่แล้วหรือไม่
  static async hasPendingRequest(reservationId) {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM cancellation_requests WHERE reservation_id = ? AND status = 'pending'`,
      args: [reservationId]
    });
    return Number(result.rows[0].count) > 0;
  }

  // อนุมัติคำขอยกเลิก
  static async approve(id, adminId) {
    return await db.execute({
      sql: `UPDATE cancellation_requests SET status = 'approved', processed_by = ?, processed_at = datetime('now') WHERE id = ?`,
      args: [adminId, id]
    });
  }

  // ปฏิเสธคำขอยกเลิก
  static async reject(id, adminId, reason) {
    return await db.execute({
      sql: `UPDATE cancellation_requests SET status = 'rejected', processed_by = ?, processed_at = datetime('now'), reject_reason = ? WHERE id = ?`,
      args: [adminId, reason, id]
    });
  }

  // นับคำขอยกเลิกที่รอดำเนินการ
  static async getPendingCount() {
    const result = await db.execute(`SELECT COUNT(*) as count FROM cancellation_requests WHERE status = 'pending'`);
    return Number(result.rows[0].count);
  }
}

module.exports = CancellationRequest;
