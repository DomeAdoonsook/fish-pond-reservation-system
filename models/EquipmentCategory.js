const db = require('../config/database');

class EquipmentCategory {
  // ดึงหมวดหมู่ทั้งหมด
  static async getAll() {
    const result = await db.execute(`
      SELECT c.*,
        (SELECT COUNT(*) FROM equipment WHERE category_id = c.id AND status = 'active') as equipment_count
      FROM equipment_categories c
      ORDER BY c.name
    `);
    return result.rows;
  }

  // ดึงหมวดหมู่ตาม ID
  static async getById(id) {
    const result = await db.execute({
      sql: 'SELECT * FROM equipment_categories WHERE id = ?',
      args: [id]
    });
    return result.rows[0] || null;
  }

  // ดึงหมวดหมู่ตามชื่อ
  static async getByName(name) {
    const result = await db.execute({
      sql: 'SELECT * FROM equipment_categories WHERE name = ?',
      args: [name]
    });
    return result.rows[0] || null;
  }

  // สร้างหมวดหมู่ใหม่
  static async create(data) {
    const result = await db.execute({
      sql: 'INSERT INTO equipment_categories (name, description) VALUES (?, ?)',
      args: [data.name, data.description || null]
    });
    return result.lastInsertRowid;
  }

  // แก้ไขหมวดหมู่
  static async update(id, data) {
    return await db.execute({
      sql: 'UPDATE equipment_categories SET name = ?, description = ? WHERE id = ?',
      args: [data.name, data.description || null, id]
    });
  }

  // ลบหมวดหมู่
  static async delete(id) {
    const countResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM equipment WHERE category_id = ?',
      args: [id]
    });

    if (Number(countResult.rows[0].count) > 0) {
      throw new Error('ไม่สามารถลบหมวดหมู่ที่มีอุปกรณ์อยู่ได้');
    }

    return await db.execute({
      sql: 'DELETE FROM equipment_categories WHERE id = ?',
      args: [id]
    });
  }

  // ดึงหมวดหมู่ที่มีอุปกรณ์ว่าง
  static async getWithAvailableEquipment() {
    const result = await db.execute(`
      SELECT c.*,
        (SELECT COUNT(*) FROM equipment e
         WHERE e.category_id = c.id
         AND e.status = 'active'
         AND e.total_quantity > 0) as available_equipment_count
      FROM equipment_categories c
      WHERE (SELECT COUNT(*) FROM equipment e
             WHERE e.category_id = c.id
             AND e.status = 'active'
             AND e.total_quantity > 0) > 0
      ORDER BY c.name
    `);
    return result.rows;
  }
}

module.exports = EquipmentCategory;
