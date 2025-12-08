const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Admin {
  // ตรวจสอบการ login
  static authenticate(username, password) {
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) return null;

    const isValid = bcrypt.compareSync(password, admin.password);
    if (!isValid) return null;

    // ไม่ส่ง password กลับ
    delete admin.password;
    return admin;
  }

  // ดึง admin ตาม ID
  static getById(id) {
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
    if (admin) delete admin.password;
    return admin;
  }

  // เปลี่ยนรหัสผ่าน
  static changePassword(id, newPassword) {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    return db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashedPassword, id);
  }

  // อัพเดท LINE User ID
  static updateLineUserId(id, lineUserId) {
    return db.prepare('UPDATE admins SET line_user_id = ? WHERE id = ?').run(lineUserId, id);
  }

  // ดึง admin ทั้งหมด
  static getAll() {
    return db.prepare('SELECT id, username, name, line_user_id, created_at FROM admins').all();
  }

  // สร้าง admin ใหม่
  static create(username, password, name) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO admins (username, password, name)
      VALUES (?, ?, ?)
    `).run(username, hashedPassword, name);
    return result.lastInsertRowid;
  }
}

module.exports = Admin;
