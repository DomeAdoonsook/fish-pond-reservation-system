const db = require('../config/database');

class EquipmentReservation {
  // ดึงการจองทั้งหมด
  static getAll() {
    const reservations = db.prepare(`
      SELECT er.*,
        a.name as approved_by_name
      FROM equipment_reservations er
      LEFT JOIN admins a ON er.approved_by = a.id
      ORDER BY er.created_at DESC
    `).all();

    return reservations.map(r => ({
      ...r,
      items: this.getItems(r.id)
    }));
  }

  // ดึงการจองตาม ID
  static getById(id) {
    const reservation = db.prepare(`
      SELECT er.*,
        a.name as approved_by_name
      FROM equipment_reservations er
      LEFT JOIN admins a ON er.approved_by = a.id
      WHERE er.id = ?
    `).get(id);

    if (reservation) {
      reservation.items = this.getItems(id);
    }

    return reservation;
  }

  // ดึงรายการอุปกรณ์ในการจอง
  static getItems(reservationId) {
    return db.prepare(`
      SELECT eri.*, e.name as equipment_name, e.unit, c.name as category_name
      FROM equipment_reservation_items eri
      JOIN equipment e ON eri.equipment_id = e.id
      LEFT JOIN equipment_categories c ON e.category_id = c.id
      WHERE eri.reservation_id = ?
    `).all(reservationId);
  }

  // ดึงการจองที่รออนุมัติ
  static getPending() {
    const reservations = db.prepare(`
      SELECT er.*
      FROM equipment_reservations er
      WHERE er.status = 'pending'
      ORDER BY er.created_at ASC
    `).all();

    return reservations.map(r => ({
      ...r,
      items: this.getItems(r.id)
    }));
  }

  // ดึงการจองที่กำลังยืมอยู่
  static getBorrowed() {
    const reservations = db.prepare(`
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
    `).all();

    return reservations.map(r => ({
      ...r,
      items: this.getItems(r.id)
    }));
  }

  // ดึงการจองตาม LINE User ID
  static getByLineUserId(lineUserId) {
    const reservations = db.prepare(`
      SELECT er.*
      FROM equipment_reservations er
      WHERE er.line_user_id = ?
      ORDER BY er.created_at DESC
      LIMIT 10
    `).all(lineUserId);

    return reservations.map(r => ({
      ...r,
      items: this.getItems(r.id)
    }));
  }

  // สร้างการจองใหม่ (พร้อมรายการอุปกรณ์)
  static create(data, items = null) {
    // รองรับทั้ง create(data, items) และ create({...data, items})
    const itemsList = items || data.items || [];

    const insertReservation = db.prepare(`
      INSERT INTO equipment_reservations (user_name, line_user_id, phone, purpose, borrow_date, return_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertItem = db.prepare(`
      INSERT INTO equipment_reservation_items (reservation_id, equipment_id, quantity)
      VALUES (?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      const result = insertReservation.run(
        data.user_name,
        data.line_user_id || null,
        data.phone || null,
        data.purpose || null,
        data.borrow_date,
        data.return_date
      );

      const reservationId = result.lastInsertRowid;

      for (const item of itemsList) {
        insertItem.run(reservationId, item.equipment_id, item.quantity);
      }

      return reservationId;
    });

    const reservationId = transaction();
    return this.getById(reservationId);
  }

  // อนุมัติการจอง
  static approve(id, adminId) {
    const stmt = db.prepare(`
      UPDATE equipment_reservations
      SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `);
    return stmt.run(adminId, id);
  }

  // ปฏิเสธการจอง
  static reject(id, adminId, reason) {
    const stmt = db.prepare(`
      UPDATE equipment_reservations
      SET status = 'rejected', approved_by = ?, approved_at = CURRENT_TIMESTAMP, reject_reason = ?
      WHERE id = ? AND status = 'pending'
    `);
    return stmt.run(adminId, reason || null, id);
  }

  // บันทึกการยืม (เมื่อมารับอุปกรณ์จริง)
  static markBorrowed(id) {
    const stmt = db.prepare(`
      UPDATE equipment_reservations
      SET status = 'borrowed'
      WHERE id = ? AND status = 'approved'
    `);
    return stmt.run(id);
  }

  // บันทึกการคืน
  static markReturned(id) {
    const stmt = db.prepare(`
      UPDATE equipment_reservations
      SET status = 'returned', actual_return_date = date('now')
      WHERE id = ? AND status IN ('borrowed', 'overdue', 'approved')
    `);

    // อัพเดท returned_quantity ของทุก item
    const updateItems = db.prepare(`
      UPDATE equipment_reservation_items
      SET returned_quantity = quantity
      WHERE reservation_id = ?
    `);

    const transaction = db.transaction(() => {
      stmt.run(id);
      updateItems.run(id);
    });

    return transaction();
  }

  // บันทึกการคืนบางส่วน
  static returnPartial(id, itemId, returnedQuantity) {
    const updateItem = db.prepare(`
      UPDATE equipment_reservation_items
      SET returned_quantity = ?
      WHERE id = ? AND reservation_id = ?
    `);

    return updateItem.run(returnedQuantity, itemId, id);
  }

  // ยกเลิกการจอง
  static cancel(id) {
    const stmt = db.prepare(`
      UPDATE equipment_reservations
      SET status = 'cancelled'
      WHERE id = ? AND status IN ('pending', 'approved')
    `);
    return stmt.run(id);
  }

  // อัพเดทสถานะเกินกำหนด
  static updateOverdue() {
    const stmt = db.prepare(`
      UPDATE equipment_reservations
      SET status = 'overdue'
      WHERE status IN ('approved', 'borrowed')
      AND date(return_date) < date('now')
    `);
    return stmt.run();
  }

  // ดึงการจองที่ใกล้ถึงกำหนดคืน
  static getExpiringSoon(days = 3) {
    const reservations = db.prepare(`
      SELECT er.*,
        julianday(er.return_date) - julianday('now') as days_remaining
      FROM equipment_reservations er
      WHERE er.status IN ('approved', 'borrowed')
      AND julianday(er.return_date) - julianday('now') BETWEEN 0 AND ?
      ORDER BY er.return_date ASC
    `).all(days);

    return reservations.map(r => ({
      ...r,
      items: this.getItems(r.id)
    }));
  }

  // นับจำนวนตามสถานะ
  static getCountByStatus() {
    return db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'borrowed' THEN 1 ELSE 0 END) as borrowed,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM equipment_reservations
    `).get();
  }

  // นับจำนวนที่รออนุมัติ
  static getPendingCount() {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM equipment_reservations WHERE status = 'pending'
    `).get();
    return result.count;
  }

  // ดึงประวัติการจอง
  static getHistory() {
    const reservations = db.prepare(`
      SELECT er.*,
        a.name as approved_by_name
      FROM equipment_reservations er
      LEFT JOIN admins a ON er.approved_by = a.id
      WHERE er.status IN ('returned', 'rejected', 'cancelled')
      ORDER BY er.created_at DESC
    `).all();

    return reservations.map(r => ({
      ...r,
      items: this.getItems(r.id)
    }));
  }
}

module.exports = EquipmentReservation;
