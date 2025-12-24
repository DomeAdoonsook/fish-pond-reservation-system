const { getDb } = require('../config/database');

class Broadcast {
  // สร้างตาราง broadcasts ถ้ายังไม่มี
  static async createTable() {
    const db = await getDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        image_url TEXT,
        admin_id INTEGER,
        sent_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // ดึงประวัติทั้งหมด
  static async getAll() {
    try {
      const db = await getDb();
      await this.createTable();
      return await db.all(`
        SELECT b.*, a.name as admin_name
        FROM broadcasts b
        LEFT JOIN admins a ON b.admin_id = a.id
        ORDER BY b.created_at DESC
        LIMIT 50
      `);
    } catch (error) {
      console.error('Error getting broadcasts:', error);
      return [];
    }
  }

  // สร้าง broadcast ใหม่
  static async create(data) {
    try {
      const db = await getDb();
      await this.createTable();
      const result = await db.run(`
        INSERT INTO broadcasts (message, image_url, admin_id)
        VALUES (?, ?, ?)
      `, [data.message, data.image_url, data.admin_id]);
      return result.lastID;
    } catch (error) {
      console.error('Error creating broadcast:', error);
      throw error;
    }
  }

  // อัพเดทจำนวนที่ส่ง
  static async updateSentCount(id, count) {
    try {
      const db = await getDb();
      await db.run('UPDATE broadcasts SET sent_count = ? WHERE id = ?', [count, id]);
    } catch (error) {
      console.error('Error updating sent count:', error);
    }
  }
}

module.exports = Broadcast;
