const db = require('../config/database');

class UserSession {
  // ดึง session ของ user
  static async get(lineUserId) {
    const result = await db.execute({
      sql: 'SELECT * FROM user_sessions WHERE line_user_id = ?',
      args: [lineUserId]
    });
    const session = result.rows[0];
    if (session && session.data) {
      session.data = JSON.parse(session.data);
    }
    return session || null;
  }

  // สร้างหรืออัพเดท session
  static async set(lineUserId, state, data = {}) {
    return await db.execute({
      sql: `INSERT INTO user_sessions (line_user_id, state, data, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(line_user_id) DO UPDATE SET
              state = excluded.state,
              data = excluded.data,
              updated_at = datetime('now')`,
      args: [lineUserId, state, JSON.stringify(data)]
    });
  }

  // รีเซ็ต session
  static async reset(lineUserId) {
    return await db.execute({
      sql: `UPDATE user_sessions SET state = 'idle', data = '{}', updated_at = datetime('now') WHERE line_user_id = ?`,
      args: [lineUserId]
    });
  }

  // ลบ session
  static async delete(lineUserId) {
    return await db.execute({
      sql: 'DELETE FROM user_sessions WHERE line_user_id = ?',
      args: [lineUserId]
    });
  }
}

module.exports = UserSession;
