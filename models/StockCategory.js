const db = require('../config/database');

const StockCategory = {
  async getAll() {
    const result = await db.execute(`
      SELECT c.*,
        (SELECT COUNT(*) FROM stock_items WHERE category_id = c.id AND status = 'active') as item_count
      FROM stock_categories c
      ORDER BY c.name
    `);
    return result.rows;
  },

  async getById(id) {
    const result = await db.execute({
      sql: `SELECT * FROM stock_categories WHERE id = ?`,
      args: [id]
    });
    return result.rows[0];
  },

  async create(data) {
    const result = await db.execute({
      sql: `INSERT INTO stock_categories (name, description) VALUES (?, ?)`,
      args: [data.name, data.description || null]
    });
    return result.lastInsertRowid;
  },

  async update(id, data) {
    await db.execute({
      sql: `UPDATE stock_categories SET name = ?, description = ? WHERE id = ?`,
      args: [data.name, data.description || null, id]
    });
  },

  async delete(id) {
    // Check if has items
    const items = await db.execute({
      sql: `SELECT COUNT(*) as count FROM stock_items WHERE category_id = ?`,
      args: [id]
    });
    if (items.rows[0].count > 0) {
      throw new Error('ไม่สามารถลบหมวดหมู่ที่มีวัสดุได้');
    }
    await db.execute({
      sql: `DELETE FROM stock_categories WHERE id = ?`,
      args: [id]
    });
  }
};

module.exports = StockCategory;
