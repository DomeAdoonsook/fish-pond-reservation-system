const db = require('../config/database');

class Equipment {
  // ดึงอุปกรณ์ทั้งหมด
  static getAll() {
    return db.prepare(`
      SELECT e.*,
        c.name as category_name,
        (e.total_quantity - COALESCE(
          (SELECT SUM(eri.quantity - eri.returned_quantity)
           FROM equipment_reservation_items eri
           JOIN equipment_reservations er ON eri.reservation_id = er.id
           WHERE eri.equipment_id = e.id
           AND er.status IN ('approved', 'borrowed', 'overdue')), 0
        )) as available_quantity
      FROM equipment e
      LEFT JOIN equipment_categories c ON e.category_id = c.id
      ORDER BY c.name, e.name
    `).all();
  }

  // ดึงอุปกรณ์ที่ active
  static getActive() {
    return db.prepare(`
      SELECT e.*,
        c.name as category_name,
        (e.total_quantity - COALESCE(
          (SELECT SUM(eri.quantity - eri.returned_quantity)
           FROM equipment_reservation_items eri
           JOIN equipment_reservations er ON eri.reservation_id = er.id
           WHERE eri.equipment_id = e.id
           AND er.status IN ('approved', 'borrowed', 'overdue')), 0
        )) as available_quantity
      FROM equipment e
      LEFT JOIN equipment_categories c ON e.category_id = c.id
      WHERE e.status = 'active'
      ORDER BY c.name, e.name
    `).all();
  }

  // ดึงอุปกรณ์ตาม ID
  static getById(id) {
    return db.prepare(`
      SELECT e.*,
        c.name as category_name,
        (e.total_quantity - COALESCE(
          (SELECT SUM(eri.quantity - eri.returned_quantity)
           FROM equipment_reservation_items eri
           JOIN equipment_reservations er ON eri.reservation_id = er.id
           WHERE eri.equipment_id = e.id
           AND er.status IN ('approved', 'borrowed', 'overdue')), 0
        )) as available_quantity
      FROM equipment e
      LEFT JOIN equipment_categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id);
  }

  // ดึงอุปกรณ์ตามหมวดหมู่
  static getByCategory(categoryId) {
    return db.prepare(`
      SELECT e.*,
        c.name as category_name,
        (e.total_quantity - COALESCE(
          (SELECT SUM(eri.quantity - eri.returned_quantity)
           FROM equipment_reservation_items eri
           JOIN equipment_reservations er ON eri.reservation_id = er.id
           WHERE eri.equipment_id = e.id
           AND er.status IN ('approved', 'borrowed', 'overdue')), 0
        )) as available_quantity
      FROM equipment e
      LEFT JOIN equipment_categories c ON e.category_id = c.id
      WHERE e.category_id = ? AND e.status = 'active'
      ORDER BY e.name
    `).all(categoryId);
  }

  // ดึงอุปกรณ์ที่ว่าง
  static getAvailable() {
    const equipment = this.getActive();
    return equipment.filter(e => e.available_quantity > 0);
  }

  // ดึงอุปกรณ์ที่ว่างตามหมวดหมู่
  static getAvailableByCategory(categoryId) {
    const equipment = this.getByCategory(categoryId);
    return equipment.filter(e => e.available_quantity > 0);
  }

  // สร้างอุปกรณ์ใหม่
  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO equipment (name, category_id, total_quantity, unit, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.name,
      data.category_id || null,
      data.total_quantity || 0,
      data.unit || 'ชิ้น',
      data.description || null,
      data.status || 'active'
    );
    return result.lastInsertRowid;
  }

  // แก้ไขอุปกรณ์
  static update(id, data) {
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.category_id !== undefined) {
      fields.push('category_id = ?');
      values.push(data.category_id || null);
    }
    if (data.total_quantity !== undefined) {
      fields.push('total_quantity = ?');
      values.push(data.total_quantity);
    }
    if (data.unit !== undefined) {
      fields.push('unit = ?');
      values.push(data.unit);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description || null);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const stmt = db.prepare(`
      UPDATE equipment SET ${fields.join(', ')} WHERE id = ?
    `);
    return stmt.run(...values);
  }

  // ลบอุปกรณ์
  static delete(id) {
    // ตรวจสอบว่ามีการจองอุปกรณ์นี้อยู่หรือไม่
    const count = db.prepare(`
      SELECT COUNT(*) as count
      FROM equipment_reservation_items eri
      JOIN equipment_reservations er ON eri.reservation_id = er.id
      WHERE eri.equipment_id = ?
      AND er.status IN ('pending', 'approved', 'borrowed', 'overdue')
    `).get(id);

    if (count.count > 0) {
      throw new Error('ไม่สามารถลบอุปกรณ์ที่มีการจองอยู่ได้');
    }

    return db.prepare(`DELETE FROM equipment WHERE id = ?`).run(id);
  }

  // ตรวจสอบจำนวนที่ว่าง (คืนจำนวนที่ว่าง)
  static checkAvailability(id, borrowDate, returnDate) {
    const equipment = this.getById(id);
    if (!equipment) return 0;
    return equipment.available_quantity;
  }

  // นับจำนวนอุปกรณ์ตามสถานะ
  static getStatusCount() {
    return db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
      FROM equipment
    `).get();
  }
}

module.exports = Equipment;
