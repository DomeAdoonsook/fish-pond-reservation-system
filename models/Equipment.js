const db = require('../config/database');

class Equipment {
  // ดึงอุปกรณ์ทั้งหมด
  static async getAll() {
    const result = await db.execute(`
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
    `);
    return result.rows;
  }

  // ดึงอุปกรณ์ที่ active
  static async getActive() {
    const result = await db.execute(`
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
    `);
    return result.rows;
  }

  // ดึงอุปกรณ์ตาม ID
  static async getById(id) {
    const result = await db.execute({
      sql: `SELECT e.*,
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
            WHERE e.id = ?`,
      args: [id]
    });
    return result.rows[0] || null;
  }

  // ดึงอุปกรณ์ตามหมวดหมู่
  static async getByCategory(categoryId) {
    const result = await db.execute({
      sql: `SELECT e.*,
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
            ORDER BY e.name`,
      args: [categoryId]
    });
    return result.rows;
  }

  // ดึงอุปกรณ์ที่ว่าง
  static async getAvailable() {
    const equipment = await this.getActive();
    return equipment.filter(e => e.available_quantity > 0);
  }

  // ดึงอุปกรณ์ที่ว่างตามหมวดหมู่
  static async getAvailableByCategory(categoryId) {
    const equipment = await this.getByCategory(categoryId);
    return equipment.filter(e => e.available_quantity > 0);
  }

  // สร้างอุปกรณ์ใหม่
  static async create(data) {
    const result = await db.execute({
      sql: `INSERT INTO equipment (name, category_id, total_quantity, unit, description, status) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        data.name,
        data.category_id || null,
        data.total_quantity || 0,
        data.unit || 'ชิ้น',
        data.description || null,
        data.status || 'active'
      ]
    });
    return result.lastInsertRowid;
  }

  // แก้ไขอุปกรณ์
  static async update(id, data) {
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
    return await db.execute({
      sql: `UPDATE equipment SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  // ลบอุปกรณ์
  static async delete(id) {
    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as count
            FROM equipment_reservation_items eri
            JOIN equipment_reservations er ON eri.reservation_id = er.id
            WHERE eri.equipment_id = ?
            AND er.status IN ('pending', 'approved', 'borrowed', 'overdue')`,
      args: [id]
    });

    if (Number(countResult.rows[0].count) > 0) {
      throw new Error('ไม่สามารถลบอุปกรณ์ที่มีการจองอยู่ได้');
    }

    return await db.execute({
      sql: `DELETE FROM equipment WHERE id = ?`,
      args: [id]
    });
  }

  // ตรวจสอบจำนวนที่ว่าง (คืนจำนวนที่ว่าง)
  static async checkAvailability(id, borrowDate, returnDate) {
    const equipment = await this.getById(id);
    if (!equipment) return 0;
    return equipment.available_quantity;
  }

  // นับจำนวนอุปกรณ์ตามสถานะ
  static async getStatusCount() {
    const result = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
      FROM equipment
    `);
    return result.rows[0];
  }
}

module.exports = Equipment;
