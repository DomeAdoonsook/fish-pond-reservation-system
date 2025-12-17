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
    const result = await db.execute('SELECT id, username, name, line_user_id, created_at FROM admins');
    return result.rows;
  }

  // สร้าง admin ใหม่
  static async create(username, password, name) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.execute({
      sql: 'INSERT INTO admins (username, password, name) VALUES (?, ?, ?)',
      args: [username, hashedPassword, name]
    });
    return result.lastInsertRowid;
  }
}

module.exports = Admin;
