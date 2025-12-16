const db = require('../config/database');

class EquipmentCategory {
  // ดึงหมวดหมู่ทั้งหมด
  static getAll() {
    return db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM equipment WHERE category_id = c.id AND status = 'active') as equipment_count
      FROM equipment_categories c
      ORDER BY c.name
    `).all();
  }

  // ดึงหมวดหมู่ตาม ID
  static getById(id) {
    return db.prepare(`
      SELECT * FROM equipment_categories WHERE id = ?
    `).get(id);
  }

  // ดึงหมวดหมู่ตามชื่อ
  static getByName(name) {
    return db.prepare(`
      SELECT * FROM equipment_categories WHERE name = ?
    `).get(name);
  }

  // สร้างหมวดหมู่ใหม่
  static create(data) {
    const stmt = db.prepare(`
      INSERT INTO equipment_categories (name, description)
      VALUES (?, ?)
    `);
    const result = stmt.run(data.name, data.description || null);
    return result.lastInsertRowid;
  }

  // แก้ไขหมวดหมู่
  static update(id, data) {
    const stmt = db.prepare(`
      UPDATE equipment_categories
      SET name = ?, description = ?
      WHERE id = ?
    `);
    return stmt.run(data.name, data.description || null, id);
  }

  // ลบหมวดหมู่
  static delete(id) {
    // ตรวจสอบว่ามีอุปกรณ์ในหมวดหมู่นี้หรือไม่
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM equipment WHERE category_id = ?
    `).get(id);

    if (count.count > 0) {
      throw new Error('ไม่สามารถลบหมวดหมู่ที่มีอุปกรณ์อยู่ได้');
    }

    return db.prepare(`DELETE FROM equipment_categories WHERE id = ?`).run(id);
  }

  // ดึงหมวดหมู่ที่มีอุปกรณ์ว่าง
  static getWithAvailableEquipment() {
    return db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM equipment e
         WHERE e.category_id = c.id
         AND e.status = 'active'
         AND e.total_quantity > 0) as available_equipment_count
      FROM equipment_categories c
      HAVING available_equipment_count > 0
      ORDER BY c.name
    `).all();
  }
}

module.exports = EquipmentCategory;
