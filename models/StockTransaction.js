const db = require('../config/database');

const StockTransaction = {
  async getByItem(itemId, limit = 50) {
    const result = await db.execute({
      sql: `
        SELECT t.*, a.name as admin_name
        FROM stock_transactions t
        LEFT JOIN admins a ON t.created_by = a.id
        WHERE t.item_id = ?
        ORDER BY t.created_at DESC
        LIMIT ?
      `,
      args: [itemId, limit]
    });
    return result.rows;
  },

  async getRecent(limit = 50) {
    const result = await db.execute({
      sql: `
        SELECT t.*, i.name as item_name, i.unit, c.name as category_name, a.name as admin_name
        FROM stock_transactions t
        JOIN stock_items i ON t.item_id = i.id
        LEFT JOIN stock_categories c ON i.category_id = c.id
        LEFT JOIN admins a ON t.created_by = a.id
        ORDER BY t.created_at DESC
        LIMIT ?
      `,
      args: [limit]
    });
    return result.rows;
  },

  async create(data) {
    const result = await db.execute({
      sql: `INSERT INTO stock_transactions
            (item_id, transaction_type, quantity, unit_price, total_price, reference_no, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.item_id,
        data.transaction_type,
        data.quantity,
        data.unit_price || null,
        data.total_price || null,
        data.reference_no || null,
        data.note || null,
        data.created_by || null
      ]
    });
    return result.lastInsertRowid;
  },

  async stockIn(itemId, quantity, unitPrice, note, adminId) {
    // Create transaction record
    await this.create({
      item_id: itemId,
      transaction_type: 'in',
      quantity: quantity,
      unit_price: unitPrice,
      total_price: quantity * unitPrice,
      note: note,
      created_by: adminId
    });

    // Update item quantity
    const StockItem = require('./StockItem');
    await StockItem.updateQuantity(itemId, quantity);

    // Update unit price if provided
    if (unitPrice) {
      await db.execute({
        sql: `UPDATE stock_items SET unit_price = ? WHERE id = ?`,
        args: [unitPrice, itemId]
      });
    }
  },

  async stockOut(itemId, quantity, note, adminId) {
    // Check available quantity
    const StockItem = require('./StockItem');
    const item = await StockItem.getById(itemId);
    if (item.current_quantity < quantity) {
      throw new Error('จำนวนไม่เพียงพอ');
    }

    // Create transaction record
    await this.create({
      item_id: itemId,
      transaction_type: 'out',
      quantity: quantity,
      unit_price: item.unit_price,
      total_price: quantity * item.unit_price,
      note: note,
      created_by: adminId
    });

    // Update item quantity
    await StockItem.updateQuantity(itemId, -quantity);
  },

  async adjust(itemId, newQuantity, note, adminId) {
    const StockItem = require('./StockItem');
    const item = await StockItem.getById(itemId);
    const diff = newQuantity - item.current_quantity;

    // Create transaction record
    await this.create({
      item_id: itemId,
      transaction_type: 'adjust',
      quantity: diff,
      note: note || `ปรับยอดจาก ${item.current_quantity} เป็น ${newQuantity}`,
      created_by: adminId
    });

    // Update item quantity
    await db.execute({
      sql: `UPDATE stock_items SET current_quantity = ? WHERE id = ?`,
      args: [newQuantity, itemId]
    });
  }
};

module.exports = StockTransaction;
