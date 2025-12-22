const db = require('../config/database');

const StockRequest = {
  async getAll(status = null) {
    let sql = `
      SELECT r.*, a.name as approved_by_name,
        (SELECT GROUP_CONCAT(i.name || ' x' || ri.requested_quantity, ', ')
         FROM stock_request_items ri
         JOIN stock_items i ON ri.item_id = i.id
         WHERE ri.request_id = r.id) as items_summary
      FROM stock_requests r
      LEFT JOIN admins a ON r.approved_by = a.id
    `;
    const args = [];

    if (status) {
      sql += ` WHERE r.status = ?`;
      args.push(status);
    }

    sql += ` ORDER BY r.created_at DESC`;

    const result = await db.execute({ sql, args });
    return result.rows;
  },

  async getById(id) {
    const result = await db.execute({
      sql: `
        SELECT r.*, a.name as approved_by_name
        FROM stock_requests r
        LEFT JOIN admins a ON r.approved_by = a.id
        WHERE r.id = ?
      `,
      args: [id]
    });
    return result.rows[0];
  },

  async getItems(requestId) {
    const result = await db.execute({
      sql: `
        SELECT ri.*, i.name as item_name, i.unit, i.current_quantity, c.name as category_name
        FROM stock_request_items ri
        JOIN stock_items i ON ri.item_id = i.id
        LEFT JOIN stock_categories c ON i.category_id = c.id
        WHERE ri.request_id = ?
      `,
      args: [requestId]
    });
    return result.rows;
  },

  async getByLineUserId(lineUserId) {
    const result = await db.execute({
      sql: `
        SELECT r.*,
          (SELECT GROUP_CONCAT(i.name || ' x' || ri.requested_quantity, ', ')
           FROM stock_request_items ri
           JOIN stock_items i ON ri.item_id = i.id
           WHERE ri.request_id = r.id) as items_summary
        FROM stock_requests r
        WHERE r.line_user_id = ?
        ORDER BY r.created_at DESC
        LIMIT 10
      `,
      args: [lineUserId]
    });
    return result.rows;
  },

  async create(data) {
    // Create request
    const result = await db.execute({
      sql: `INSERT INTO stock_requests (user_name, line_user_id, phone, purpose)
            VALUES (?, ?, ?, ?)`,
      args: [data.user_name, data.line_user_id || null, data.phone || null, data.purpose]
    });
    const requestId = result.lastInsertRowid;

    // Add items
    for (const item of data.items) {
      await db.execute({
        sql: `INSERT INTO stock_request_items (request_id, item_id, requested_quantity)
              VALUES (?, ?, ?)`,
        args: [requestId, item.item_id, item.quantity]
      });
    }

    return { id: requestId };
  },

  async approve(id, adminId, itemApprovals) {
    // Update approved quantities and deduct from stock
    const StockItem = require('./StockItem');
    const StockTransaction = require('./StockTransaction');

    for (const approval of itemApprovals) {
      // Update approved quantity
      await db.execute({
        sql: `UPDATE stock_request_items SET approved_quantity = ? WHERE id = ?`,
        args: [approval.approved_quantity, approval.item_id]
      });

      // Deduct from stock if approved
      if (approval.approved_quantity > 0) {
        await StockTransaction.stockOut(
          approval.stock_item_id,
          approval.approved_quantity,
          `เบิกจ่ายตามคำขอ #REQ-${String(id).padStart(4, '0')}`,
          adminId
        );
      }
    }

    // Update request status
    await db.execute({
      sql: `UPDATE stock_requests SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`,
      args: [adminId, id]
    });

    // Check low stock and notify
    const lowStockItems = await StockItem.getLowStock();
    if (lowStockItems.length > 0) {
      const { notifyLowStock } = require('../utils/lineNotify');
      await notifyLowStock(lowStockItems);
    }
  },

  async reject(id, adminId, reason) {
    await db.execute({
      sql: `UPDATE stock_requests SET status = 'rejected', approved_by = ?, approved_at = datetime('now'), reject_reason = ? WHERE id = ?`,
      args: [adminId, reason, id]
    });
  },

  async getPendingCount() {
    const result = await db.execute(`SELECT COUNT(*) as count FROM stock_requests WHERE status = 'pending'`);
    return result.rows[0].count;
  }
};

module.exports = StockRequest;
