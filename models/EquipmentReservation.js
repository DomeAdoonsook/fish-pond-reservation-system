const db = require('../config/database');

class EquipmentReservation {
  // ดึงรายการอุปกรณ์ในการจอง
  static async getItems(reservationId) {
    const result = await db.execute({
      sql: `SELECT eri.*, e.name as equipment_name, e.unit, c.name as category_name
            FROM equipment_reservation_items eri
            JOIN equipment e ON eri.equipment_id = e.id
            LEFT JOIN equipment_categories c ON e.category_id = c.id
            WHERE eri.reservation_id = ?`,
      args: [reservationId]
    });
    return result.rows;
  }

  // ดึงการจองทั้งหมด
  static async getAll() {
    const result = await db.execute(`
      SELECT er.*, a.name as approved_by_name
      FROM equipment_reservations er
      LEFT JOIN admins a ON er.approved_by = a.id
      ORDER BY er.created_at DESC
    `);

    const reservations = [];
    for (const r of result.rows) {
      const items = await this.getItems(r.id);
      reservations.push({ ...r, items });
    }
    return reservations;
  }

  // ดึงการจองตาม ID
  static async getById(id) {
    const result = await db.execute({
      sql: `SELECT er.*, a.name as approved_by_name
            FROM equipment_reservations er
            LEFT JOIN admins a ON er.approved_by = a.id
            WHERE er.id = ?`,
      args: [id]
    });

    const reservation = result.rows[0];
    if (reservation) {
      reservation.items = await this.getItems(id);
    }
    return reservation || null;
  }

  // ดึงการจองที่รออนุมัติ
  static async getPending() {
    const result = await db.execute(`
      SELECT er.*
      FROM equipment_reservations er
      WHERE er.status = 'pending'
      ORDER BY er.created_at ASC
    `);

    const reservations = [];
    for (const r of result.rows) {
      const items = await this.getItems(r.id);
      reservations.push({ ...r, items });
    }
    return reservations;
  }

  // ดึงการจองที่กำลังยืมอยู่
  static async getBorrowed() {
    const result = await db.execute(`
      SELECT er.*,
        a.name as approved_by_name,
        CASE
          WHEN date(er.return_date) < date('now') THEN 1
          ELSE 0
        END as is_overdue,
        julianday(er.return_date) - julianday('now') as days_remaining
      FROM equipment_reservations er
      LEFT JOIN admins a ON er.approved_by = a.id
      WHERE er.status IN ('approved', 'borrowed', 'overdue')
      ORDER BY er.return_date ASC
    `);

    const reservations = [];
    for (const r of result.rows) {
      const items = await this.getItems(r.id);
      reservations.push({ ...r, items });
    }
    return reservations;
  }

  // ดึงการจองตาม LINE User ID
  static async getByLineUserId(lineUserId) {
    const result = await db.execute({
      sql: `SELECT er.*
            FROM equipment_reservations er
            WHERE er.line_user_id = ?
            ORDER BY er.created_at DESC
            LIMIT 10`,
      args: [lineUserId]
    });

    const reservations = [];
    for (const r of result.rows) {
      const items = await this.getItems(r.id);
      reservations.push({ ...r, items });
    }
    return reservations;
  }

  // สร้างการจองใหม่ (พร้อมรายการอุปกรณ์)
  static async create(data, items = null) {
    const itemsList = items || data.items || [];

    // Insert reservation
    const reservationResult = await db.execute({
      sql: `INSERT INTO equipment_reservations (user_name, line_user_id, phone, purpose, borrow_date, return_date)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        data.user_name,
        data.line_user_id || null,
        data.phone || null,
        data.purpose || null,
        data.borrow_date,
        data.return_date
      ]
    });

    const reservationId = Number(reservationResult.lastInsertRowid);

    // Insert items
    for (const item of itemsList) {
      await db.execute({
        sql: `INSERT INTO equipment_reservation_items (reservation_id, equipment_id, quantity) VALUES (?, ?, ?)`,
        args: [reservationId, item.equipment_id, item.quantity]
      });
    }

    return await this.getById(reservationId);
  }

  // อนุมัติการจอง
  static async approve(id, adminId) {
    return await db.execute({
      sql: `UPDATE equipment_reservations SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
      args: [adminId, id]
    });
  }

  // ปฏิเสธการจอง
  static async reject(id, adminId, reason) {
    return await db.execute({
      sql: `UPDATE equipment_reservations SET status = 'rejected', approved_by = ?, approved_at = CURRENT_TIMESTAMP, reject_reason = ? WHERE id = ? AND status = 'pending'`,
      args: [adminId, reason || null, id]
    });
  }

  // บันทึกการยืม (เมื่อมารับอุปกรณ์จริง)
  static async markBorrowed(id) {
    return await db.execute({
      sql: `UPDATE equipment_reservations SET status = 'borrowed' WHERE id = ? AND status = 'approved'`,
      args: [id]
    });
  }

  // บันทึกการคืน
  static async markReturned(id) {
    await db.execute({
      sql: `UPDATE equipment_reservations SET status = 'returned', actual_return_date = date('now') WHERE id = ? AND status IN ('borrowed', 'overdue', 'approved')`,
      args: [id]
    });

    await db.execute({
      sql: `UPDATE equipment_reservation_items SET returned_quantity = quantity WHERE reservation_id = ?`,
      args: [id]
    });
  }

  // บันทึกการคืนบางส่วน
  static async returnPartial(id, itemId, returnedQuantity) {
    return await db.execute({
      sql: `UPDATE equipment_reservation_items SET returned_quantity = ? WHERE id = ? AND reservation_id = ?`,
      args: [returnedQuantity, itemId, id]
    });
  }

  // ยกเลิกการจอง
  static async cancel(id) {
    return await db.execute({
      sql: `UPDATE equipment_reservations SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'approved')`,
      args: [id]
    });
  }

  // อัพเดทสถานะเกินกำหนด
  static async updateOverdue() {
    return await db.execute(`
      UPDATE equipment_reservations
      SET status = 'overdue'
      WHERE status IN ('approved', 'borrowed')
      AND date(return_date) < date('now')
    `);
  }

  // ดึงการจองที่ใกล้ถึงกำหนดคืน
  static async getExpiringSoon(days = 3) {
    const result = await db.execute({
      sql: `SELECT er.*,
              julianday(er.return_date) - julianday('now') as days_remaining
            FROM equipment_reservations er
            WHERE er.status IN ('approved', 'borrowed')
            AND julianday(er.return_date) - julianday('now') BETWEEN 0 AND ?
            ORDER BY er.return_date ASC`,
      args: [days]
    });

    const reservations = [];
    for (const r of result.rows) {
      const items = await this.getItems(r.id);
      reservations.push({ ...r, items });
    }
    return reservations;
  }

  // นับจำนวนตามสถานะ
  static async getCountByStatus() {
    const result = await db.execute(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'borrowed' THEN 1 ELSE 0 END) as borrowed,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM equipment_reservations
    `);
    return result.rows[0];
  }

  // นับจำนวนที่รออนุมัติ
  static async getPendingCount() {
    const result = await db.execute(`SELECT COUNT(*) as count FROM equipment_reservations WHERE status = 'pending'`);
    return Number(result.rows[0].count);
  }

  // ดึงประวัติการจอง
  static async getHistory() {
    const result = await db.execute(`
      SELECT er.*, a.name as approved_by_name
      FROM equipment_reservations er
      LEFT JOIN admins a ON er.approved_by = a.id
      WHERE er.status IN ('returned', 'rejected', 'cancelled')
      ORDER BY er.created_at DESC
    `);

    const reservations = [];
    for (const r of result.rows) {
      const items = await this.getItems(r.id);
      reservations.push({ ...r, items });
    }
    return reservations;
  }
}

module.exports = EquipmentReservation;
