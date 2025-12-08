const db = require('../config/database');

class Reservation {
  // สร้างการจองใหม่
  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO reservations (pond_id, user_name, line_user_id, fish_type, fish_quantity, start_date, end_date, purpose)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.pond_id,
      data.user_name,
      data.line_user_id,
      data.fish_type,
      data.fish_quantity,
      data.start_date,
      data.end_date,
      data.purpose || null
    );
    return result.lastInsertRowid;
  }

  // ดึงการจองทั้งหมด
  static getAll() {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone,
        a.name as approved_by_name
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON r.approved_by = a.id
      ORDER BY r.created_at DESC
    `).all();
  }

  // ดึงการจองตาม ID
  static getById(id) {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone,
        a.name as approved_by_name
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON r.approved_by = a.id
      WHERE r.id = ?
    `).get(id);
  }

  // ดึงการจองที่รออนุมัติ
  static getPending() {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC
    `).all();
  }

  // ดึงการจองที่ active
  static getActive() {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days,
        CAST(julianday(r.end_date) - julianday('now') AS INTEGER) as days_remaining
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
      ORDER BY r.end_date ASC
    `).all();
  }

  // ดึงการจองตาม LINE User ID
  static getByLineUserId(lineUserId) {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.line_user_id = ?
        AND r.status IN ('pending', 'approved')
        AND (r.status = 'pending' OR date('now') <= r.end_date)
      ORDER BY r.created_at DESC
    `).all(lineUserId);
  }

  // อนุมัติการจอง
  static approve(id, adminId) {
    return db.prepare(`
      UPDATE reservations
      SET status = 'approved',
          approved_by = ?,
          approved_at = datetime('now')
      WHERE id = ?
    `).run(adminId, id);
  }

  // ไม่อนุมัติการจอง
  static reject(id, adminId, reason) {
    return db.prepare(`
      UPDATE reservations
      SET status = 'rejected',
          approved_by = ?,
          approved_at = datetime('now'),
          reject_reason = ?
      WHERE id = ?
    `).run(adminId, reason, id);
  }

  // ยกเลิกการจอง
  static cancel(id) {
    return db.prepare(`
      UPDATE reservations
      SET status = 'cancelled'
      WHERE id = ?
    `).run(id);
  }

  // เสร็จสิ้นการจอง (คืนบ่อ)
  static complete(id) {
    return db.prepare(`
      UPDATE reservations
      SET status = 'completed',
          end_date = date('now')
      WHERE id = ?
    `).run(id);
  }

  // ดึงการจองที่ใกล้หมดอายุ (ภายใน 7 วัน)
  static getExpiringSoon() {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone,
        CAST(julianday(r.end_date) - julianday('now') AS INTEGER) as days_remaining
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'approved'
        AND julianday(r.end_date) - julianday('now') BETWEEN 0 AND 7
      ORDER BY r.end_date ASC
    `).all();
  }

  // ดึงการจองที่หมดอายุแล้ว
  static getExpired() {
    return db.prepare(`
      SELECT r.*, p.pond_code, p.zone
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'approved'
        AND date('now') > r.end_date
    `).all();
  }

  // อัพเดทสถานะการจองที่หมดอายุเป็น completed
  static completeExpired() {
    return db.prepare(`
      UPDATE reservations
      SET status = 'completed'
      WHERE status = 'approved'
        AND date('now') > end_date
    `).run();
  }

  // นับจำนวนการจองตามสถานะ
  static getCountByStatus() {
    return db.prepare(`
      SELECT status, COUNT(*) as count
      FROM reservations
      GROUP BY status
    `).all();
  }

  // อัพเดทข้อมูลการจอง
  static update(id, data) {
    const fields = [];
    const values = [];

    if (data.fish_type !== undefined) {
      fields.push('fish_type = ?');
      values.push(data.fish_type);
    }
    if (data.fish_quantity !== undefined) {
      fields.push('fish_quantity = ?');
      values.push(data.fish_quantity);
    }
    if (data.start_date !== undefined) {
      fields.push('start_date = ?');
      values.push(data.start_date);
    }
    if (data.end_date !== undefined) {
      fields.push('end_date = ?');
      values.push(data.end_date);
    }
    if (data.user_name !== undefined) {
      fields.push('user_name = ?');
      values.push(data.user_name);
    }

    if (fields.length === 0) return null;

    values.push(id);
    return db.prepare(`
      UPDATE reservations SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  // ดึงประวัติการจองทั้งหมดของบ่อ
  static getHistoryByPondId(pondId) {
    return db.prepare(`
      SELECT r.*, p.pond_code,
        a.name as approved_by_name
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON r.approved_by = a.id
      WHERE r.pond_id = ?
      ORDER BY r.created_at DESC
    `).all(pondId);
  }
}

module.exports = Reservation;
