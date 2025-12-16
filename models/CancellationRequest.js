const db = require('../config/database');

class CancellationRequest {
  // สร้างคำขอยกเลิกใหม่
  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO cancellation_requests (reservation_id, reason, phone)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(
      data.reservation_id,
      data.reason || null,
      data.phone || null
    );
    return result.lastInsertRowid;
  }

  // ดึงคำขอยกเลิกทั้งหมด
  static getAll() {
    return db.prepare(`
      SELECT cr.*,
        r.pond_id, r.user_name, r.fish_type, r.fish_quantity, r.start_date, r.end_date, r.line_user_id,
        p.pond_code, p.zone,
        a.name as processed_by_name
      FROM cancellation_requests cr
      JOIN reservations r ON cr.reservation_id = r.id
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON cr.processed_by = a.id
      ORDER BY cr.created_at DESC
    `).all();
  }

  // ดึงคำขอยกเลิกตาม ID
  static getById(id) {
    return db.prepare(`
      SELECT cr.*,
        r.pond_id, r.user_name, r.fish_type, r.fish_quantity, r.start_date, r.end_date, r.line_user_id,
        p.pond_code, p.zone,
        a.name as processed_by_name
      FROM cancellation_requests cr
      JOIN reservations r ON cr.reservation_id = r.id
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON cr.processed_by = a.id
      WHERE cr.id = ?
    `).get(id);
  }

  // ดึงคำขอยกเลิกที่รอดำเนินการ
  static getPending() {
    return db.prepare(`
      SELECT cr.*,
        r.pond_id, r.user_name, r.fish_type, r.fish_quantity, r.start_date, r.end_date, r.line_user_id,
        p.pond_code, p.zone
      FROM cancellation_requests cr
      JOIN reservations r ON cr.reservation_id = r.id
      JOIN ponds p ON r.pond_id = p.id
      WHERE cr.status = 'pending'
      ORDER BY cr.created_at ASC
    `).all();
  }

  // ตรวจสอบว่ามีคำขอยกเลิกที่รอดำเนินการอยู่แล้วหรือไม่
  static hasPendingRequest(reservationId) {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM cancellation_requests
      WHERE reservation_id = ? AND status = 'pending'
    `).get(reservationId);
    return result.count > 0;
  }

  // อนุมัติคำขอยกเลิก
  static approve(id, adminId) {
    return db.prepare(`
      UPDATE cancellation_requests
      SET status = 'approved',
          processed_by = ?,
          processed_at = datetime('now')
      WHERE id = ?
    `).run(adminId, id);
  }

  // ปฏิเสธคำขอยกเลิก
  static reject(id, adminId, reason) {
    return db.prepare(`
      UPDATE cancellation_requests
      SET status = 'rejected',
          processed_by = ?,
          processed_at = datetime('now'),
          reject_reason = ?
      WHERE id = ?
    `).run(adminId, reason, id);
  }

  // นับคำขอยกเลิกที่รอดำเนินการ
  static getPendingCount() {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM cancellation_requests
      WHERE status = 'pending'
    `).get();
    return result.count;
  }
}

module.exports = CancellationRequest;
