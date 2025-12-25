const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Admin {
  // ตรวจสอบการ login
  static async authenticate(username, password) {
    const result = await db.execute({
      sql: 'SELECT * FROM admins WHERE username = ?',
      args: [username]
    });
    const admin = result.rows[0];
    if (!admin) return null;

    const isValid = bcrypt.compareSync(password, admin.password);
    if (!isValid) return null;

    // ไม่ส่ง password กลับ
    const { password: _, ...adminWithoutPassword } = admin;
    return adminWithoutPassword;
  }

  // ดึง admin ตาม ID
  static async getById(id) {
    const result = await db.execute({
      sql: 'SELECT * FROM admins WHERE id = ?',
      args: [id]
    });
    const admin = result.rows[0];
    if (admin) {
      const { password: _, ...adminWithoutPassword } = admin;
      return adminWithoutPassword;
    }
    return null;
  }

  // เปลี่ยนรหัสผ่าน
  static async changePassword(id, newPassword) {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    return await db.execute({
      sql: 'UPDATE admins SET password = ? WHERE id = ?',
      args: [hashedPassword, id]
    });
  }

  // อัพเดท LINE User ID
  static async updateLineUserId(id, lineUserId) {
    return await db.execute({
      sql: 'UPDATE admins SET line_user_id = ? WHERE id = ?',
      args: [lineUserId, id]
    });
  }

  // ดึง admin ทั้งหมด
  static async getAll() {
    const result = await db.execute('SELECT id, username, name, line_user_id, receive_notifications, created_at FROM admins');
    return result.rows;
  }

  // สร้าง admin ใหม่
  static async create(username, password, name, lineUserId = null) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.execute({
      sql: 'INSERT INTO admins (username, password, name, line_user_id) VALUES (?, ?, ?, ?)',
      args: [username, hashedPassword, name, lineUserId]
    });
    return Number(result.lastInsertRowid);
  }

  // อัพเดทข้อมูล admin
  static async update(id, data) {
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.line_user_id !== undefined) {
      fields.push('line_user_id = ?');
      values.push(data.line_user_id || null);
    }
    if (data.receive_notifications !== undefined) {
      fields.push('receive_notifications = ?');
      values.push(data.receive_notifications ? 1 : 0);
    }

    if (fields.length === 0) return;

    values.push(id);
    await db.execute({
      sql: `UPDATE admins SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  // ลบ admin
  static async delete(id) {
    // ตั้งค่า approved_by เป็น NULL ในตารางที่เชื่อมโยง
    await db.execute({
      sql: 'UPDATE reservations SET approved_by = NULL WHERE approved_by = ?',
      args: [id]
    });
    await db.execute({
      sql: 'UPDATE equipment_reservations SET approved_by = NULL WHERE approved_by = ?',
      args: [id]
    });
    await db.execute({
      sql: 'UPDATE stock_requests SET approved_by = NULL WHERE approved_by = ?',
      args: [id]
    });
    await db.execute({
      sql: 'UPDATE cancellation_requests SET processed_by = NULL WHERE processed_by = ?',
      args: [id]
    });
    await db.execute({
      sql: 'UPDATE stock_transactions SET created_by = NULL WHERE created_by = ?',
      args: [id]
    });

    // ลบ admin
    await db.execute({
      sql: 'DELETE FROM admins WHERE id = ?',
      args: [id]
    });
  }

  // ดึง admin ที่ต้องการรับแจ้งเตือน
  static async getNotificationReceivers() {
    const result = await db.execute(`
      SELECT * FROM admins
      WHERE line_user_id IS NOT NULL
        AND line_user_id != ''
        AND (receive_notifications = 1 OR receive_notifications IS NULL)
    `);
    return result.rows;
  }
}

module.exports = Admin;
