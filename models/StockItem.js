const db = require('../config/database');

const StockItem = {
  async getAll() {
    const result = await db.execute(`
      SELECT i.*, c.name as category_name
      FROM stock_items i
      LEFT JOIN stock_categories c ON i.category_id = c.id
      WHERE i.status = 'active'
      ORDER BY c.name, i.name
    `);
    return result.rows;
  },

  async getById(id) {
    const result = await db.execute({
      sql: `
        SELECT i.*, c.name as category_name
        FROM stock_items i
        LEFT JOIN stock_categories c ON i.category_id = c.id
        WHERE i.id = ?
      `,
      args: [id]
    });
    return result.rows[0];
  },

  async getByCategory(categoryId) {
    const result = await db.execute({
      sql: `
        SELECT i.*, c.name as category_name
        FROM stock_items i
        LEFT JOIN stock_categories c ON i.category_id = c.id
        WHERE i.category_id = ? AND i.status = 'active'
        ORDER BY i.name
      `,
      args: [categoryId]
    });
    return result.rows;
  },

  async getLowStock() {
    const result = await db.execute(`
      SELECT i.*, c.name as category_name
      FROM stock_items i
      LEFT JOIN stock_categories c ON i.category_id = c.id
      WHERE i.status = 'active' AND i.current_quantity <= i.min_quantity AND i.min_quantity > 0
      ORDER BY (i.current_quantity / NULLIF(i.min_quantity, 0)) ASC
    `);
    return result.rows;
  },

  async create(data) {
    const result = await db.execute({
      sql: `INSERT INTO stock_items (name, category_id, unit, unit_price, current_quantity, min_quantity, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.name,
        data.category_id || null,
        data.unit || 'หน่วย',
        data.unit_price || 0,
        data.current_quantity || 0,
        data.min_quantity || 0,
        data.description || null
      ]
    });
    return Number(result.lastInsertRowid);
  },

  async update(id, data) {
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
    if (data.unit !== undefined) {
      fields.push('unit = ?');
      values.push(data.unit);
    }
    if (data.unit_price !== undefined) {
      fields.push('unit_price = ?');
      values.push(data.unit_price);
    }
    if (data.min_quantity !== undefined) {
      fields.push('min_quantity = ?');
      values.push(data.min_quantity);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }

    if (fields.length === 0) return;

    values.push(id);
    await db.execute({
      sql: `UPDATE stock_items SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  },

  async updateQuantity(id, change) {
    await db.execute({
      sql: `UPDATE stock_items SET current_quantity = current_quantity + ? WHERE id = ?`,
      args: [change, id]
    });
  },

  async delete(id) {
    await db.execute({
      sql: `UPDATE stock_items SET status = 'inactive' WHERE id = ?`,
      args: [id]
    });
  },

  async search(query) {
    const result = await db.execute({
      sql: `
        SELECT i.*, c.name as category_name
        FROM stock_items i
        LEFT JOIN stock_categories c ON i.category_id = c.id
        WHERE i.status = 'active' AND (i.name LIKE ? OR c.name LIKE ?)
        ORDER BY i.name
      `,
      args: [`%${query}%`, `%${query}%`]
    });
    return result.rows;
  }
};

module.exports = StockItem;
