const db = require('../config/database');

class Reservation {
  // สร้างการจองใหม่
  static async create(data) {
    const result = await db.execute({
      sql: `INSERT INTO reservations (pond_id, user_name, line_user_id, phone, fish_type, fish_quantity, start_date, end_date, purpose)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.pond_id,
        data.user_name,
        data.line_user_id || null,
        data.phone || null,
        data.fish_type,
        data.fish_quantity,
        data.start_date,
        data.end_date,
        data.purpose || null
      ]
    });
    return result.lastInsertRowid;
  }

  // ดึงการจองทั้งหมด
  static async getAll() {
    const result = await db.execute(`
      SELECT r.*, p.pond_code, p.zone,
        a.name as approved_by_name
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      LEFT JOIN admins a ON r.approved_by = a.id
      ORDER BY r.created_at DESC
    `);
    return result.rows;
  }

  // ดึงการจองตาม ID
  static async getById(id) {
    const result = await db.execute({
      sql: `SELECT r.*, p.pond_code, p.zone,
              a.name as approved_by_name
            FROM reservations r
            JOIN ponds p ON r.pond_id = p.id
            LEFT JOIN admins a ON r.approved_by = a.id
            WHERE r.id = ?`,
      args: [id]
    });
    return result.rows[0] || null;
  }

  // ดึงการจองที่รออนุมัติ
  static async getPending() {
    const result = await db.execute(`
      SELECT r.*, p.pond_code, p.zone
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC
    `);
    return result.rows;
  }

  // ดึงการจองที่ active
  static async getActive() {
    const result = await db.execute(`
      SELECT r.*, p.pond_code, p.zone,
        CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days,
        CAST(julianday(r.end_date) - julianday('now') AS INTEGER) as days_remaining
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'approved'
        AND date('now') BETWEEN r.start_date AND r.end_date
      ORDER BY r.end_date ASC
    `);
    return result.rows;
  }

  // ดึงการจองตาม LINE User ID
  static async getByLineUserId(lineUserId) {
    const result = await db.execute({
      sql: `SELECT r.*, p.pond_code, p.zone,
              CAST(julianday('now') - julianday(r.start_date) AS INTEGER) as fish_age_days
            FROM reservations r
            JOIN ponds p ON r.pond_id = p.id
            WHERE r.line_user_id = ?
              AND r.status IN ('pending', 'approved')
              AND (r.status = 'pending' OR date('now') <= r.end_date)
            ORDER BY r.created_at DESC`,
      args: [lineUserId]
    });
    return result.rows;
  }

  // อนุมัติการจอง
  static async approve(id, adminId) {
    return await db.execute({
      sql: `UPDATE reservations
            SET status = 'approved',
                approved_by = ?,
                approved_at = datetime('now')
            WHERE id = ?`,
      args: [adminId, id]
    });
  }

  // ไม่อนุมัติการจอง
  static async reject(id, adminId, reason) {
    return await db.execute({
      sql: `UPDATE reservations
            SET status = 'rejected',
                approved_by = ?,
                approved_at = datetime('now'),
                reject_reason = ?
            WHERE id = ?`,
      args: [adminId, reason, id]
    });
  }

  // ยกเลิกการจอง
  static async cancel(id) {
    return await db.execute({
      sql: `UPDATE reservations SET status = 'cancelled' WHERE id = ?`,
      args: [id]
    });
  }

  // เสร็จสิ้นการจอง (คืนบ่อ)
  static async complete(id) {
    return await db.execute({
      sql: `UPDATE reservations SET status = 'completed', end_date = date('now') WHERE id = ?`,
      args: [id]
    });
  }

  // ดึงการจองที่ใกล้หมดอายุ (ภายใน 7 วัน)
  static async getExpiringSoon() {
    const result = await db.execute(`
      SELECT r.*, p.pond_code, p.zone,
        CAST(julianday(r.end_date) - julianday('now') AS INTEGER) as days_remaining
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'approved'
        AND julianday(r.end_date) - julianday('now') BETWEEN 0 AND 7
      ORDER BY r.end_date ASC
    `);
    return result.rows;
  }

  // ดึงการจองที่หมดอายุแล้ว
  static async getExpired() {
    const result = await db.execute(`
      SELECT r.*, p.pond_code, p.zone
      FROM reservations r
      JOIN ponds p ON r.pond_id = p.id
      WHERE r.status = 'approved'
        AND date('now') > r.end_date
    `);
    return result.rows;
  }

  // อัพเดทสถานะการจองที่หมดอายุเป็น completed
  static async completeExpired() {
    return await db.execute(`
      UPDATE reservations
      SET status = 'completed'
      WHERE status = 'approved'
        AND date('now') > end_date
    `);
  }

  // นับจำนวนการจองตามสถานะ
  static async getCountByStatus() {
    const result = await db.execute(`
      SELECT status, COUNT(*) as count
      FROM reservations
      GROUP BY status
    `);
    return result.rows;
  }

  // นับจำนวนการจองที่รออนุมัติ
  static async getPendingCount() {
    const result = await db.execute(`
      SELECT COUNT(*) as count FROM reservations WHERE status = 'pending'
    `);
    return Number(result.rows[0].count);
  }

  // อัพเดทข้อมูลการจอง
  static async update(id, data) {
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
    return await db.execute({
      sql: `UPDATE reservations SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  // ดึงประวัติการจองทั้งหมดของบ่อ
  static async getHistoryByPondId(pondId) {
    const result = await db.execute({
      sql: `SELECT r.*, p.pond_code,
              a.name as approved_by_name
            FROM reservations r
            JOIN ponds p ON r.pond_id = p.id
            LEFT JOIN admins a ON r.approved_by = a.id
            WHERE r.pond_id = ?
            ORDER BY r.created_at DESC`,
      args: [pondId]
    });
    return result.rows;
  }
}

module.exports = Reservation;
