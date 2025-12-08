const db = require('../config/database');

class UserSession {
  // ดึง session ของ user
  static get(lineUserId) {
    const session = db.prepare('SELECT * FROM user_sessions WHERE line_user_id = ?').get(lineUserId);
    if (session && session.data) {
      session.data = JSON.parse(session.data);
    }
    return session;
  }

  // สร้างหรืออัพเดท session
  static set(lineUserId, state, data = {}) {
    return db.prepare(`
      INSERT INTO user_sessions (line_user_id, state, data, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(line_user_id) DO UPDATE SET
        state = excluded.state,
        data = excluded.data,
        updated_at = datetime('now')
    `).run(lineUserId, state, JSON.stringify(data));
  }

  // รีเซ็ต session
  static reset(lineUserId) {
    return db.prepare(`
      UPDATE user_sessions
      SET state = 'idle', data = '{}', updated_at = datetime('now')
      WHERE line_user_id = ?
    `).run(lineUserId);
  }

  // ลบ session
  static delete(lineUserId) {
    return db.prepare('DELETE FROM user_sessions WHERE line_user_id = ?').run(lineUserId);
  }
}

module.exports = UserSession;
