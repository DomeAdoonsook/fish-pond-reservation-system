require('dotenv').config();
const bcrypt = require('bcryptjs');

// ใช้ database config ที่รองรับ Turso
const db = require('../config/database');

async function initDatabase() {
  console.log('🐟 เริ่มต้นสร้างฐานข้อมูลระบบจองบ่อเลี้ยงปลา...\n');

  // เรียกใช้ initDatabase จาก config/database.js ก่อน (สร้างตาราง)
  const { initDatabase: initDb } = require('../config/database');
  await initDb();
  console.log('✅ สร้างตารางเรียบร้อย\n');

  // สร้าง Admin เริ่มต้น
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);

  await db.execute({
    sql: `INSERT OR IGNORE INTO admins (username, password, name) VALUES (?, ?, ?)`,
    args: ['admin', hashedPassword, 'ผู้ดูแลระบบ']
  });
  console.log('✅ สร้าง Admin เริ่มต้น (username: admin)\n');

  // ข้อมูลบ่อทั้งหมดตามผังภาพ - พร้อมตำแหน่ง (% ของภาพ)
  const pondsData = [
    // โซน A - บ่อดินขนาดใหญ่ (บนซ้าย)
    { code: 'A1', zone: 'A', size: 'large', x: 44, y: 8, w: 14, h: 12 },
    { code: 'A2', zone: 'A', size: 'large', x: 35, y: 5, w: 5, h: 5 },
    { code: 'A3', zone: 'A', size: 'large', x: 14, y: 5, w: 10, h: 8 },
    { code: 'A4', zone: 'A', size: 'large', x: 4, y: 5, w: 8, h: 8 },

    // โซน B - บ่อดินขนาดกลาง
    { code: 'B1', zone: 'B', size: 'medium', x: 44, y: 22, w: 8, h: 8 },
    { code: 'B2', zone: 'B', size: 'medium', x: 36, y: 22, w: 8, h: 8 },
    { code: 'B3', zone: 'B', size: 'medium', x: 30, y: 22, w: 6, h: 6 },
    { code: 'B4', zone: 'B', size: 'medium', x: 24, y: 15, w: 6, h: 6 },
    { code: 'B5', zone: 'B', size: 'medium', x: 18, y: 15, w: 5, h: 5 },
    { code: 'B6', zone: 'B', size: 'medium', x: 12, y: 15, w: 5, h: 5 },
    { code: 'B7', zone: 'B', size: 'medium', x: 6, y: 15, w: 5, h: 5 },

    // โซน C - บ่อดินขนาดกลาง (แถวกลาง)
    { code: 'C1', zone: 'C', size: 'medium', x: 40, y: 32, w: 5, h: 5 },
    { code: 'C2', zone: 'C', size: 'medium', x: 35, y: 32, w: 5, h: 5 },
    { code: 'C3', zone: 'C', size: 'medium', x: 30, y: 32, w: 5, h: 5 },
    { code: 'C4', zone: 'C', size: 'medium', x: 25, y: 32, w: 5, h: 5 },
    { code: 'C5', zone: 'C', size: 'medium', x: 20, y: 32, w: 5, h: 5 },
    { code: 'C6', zone: 'C', size: 'medium', x: 10, y: 28, w: 8, h: 8 },
    { code: 'C7', zone: 'C', size: 'medium', x: 40, y: 40, w: 5, h: 5 },
    { code: 'C8', zone: 'C', size: 'medium', x: 35, y: 40, w: 5, h: 5 },
    { code: 'C9', zone: 'C', size: 'medium', x: 30, y: 40, w: 5, h: 5 },
    { code: 'C10', zone: 'C', size: 'medium', x: 25, y: 40, w: 5, h: 5 },
    { code: 'C11', zone: 'C', size: 'medium', x: 20, y: 40, w: 5, h: 5 },
    { code: 'C12', zone: 'C', size: 'medium', x: 15, y: 45, w: 5, h: 5 },
    { code: 'C13', zone: 'C', size: 'medium', x: 10, y: 45, w: 5, h: 5 },
    { code: 'C14', zone: 'C', size: 'medium', x: 5, y: 45, w: 5, h: 5 },

    // โซน D - บ่อดินขนาดกลาง (แถวล่าง)
    { code: 'D1', zone: 'D', size: 'medium', x: 40, y: 50, w: 5, h: 5 },
    { code: 'D2', zone: 'D', size: 'medium', x: 35, y: 50, w: 5, h: 5 },
    { code: 'D3', zone: 'D', size: 'medium', x: 30, y: 50, w: 5, h: 5 },
    { code: 'D4', zone: 'D', size: 'medium', x: 25, y: 50, w: 5, h: 5 },
    { code: 'D5', zone: 'D', size: 'medium', x: 20, y: 50, w: 5, h: 5 },
    { code: 'D6', zone: 'D', size: 'large', x: 35, y: 62, w: 12, h: 10 },

    // โซน E - บ่อในร่ม/คอนกรีต
    { code: 'E1', zone: 'E', size: 'small', x: 60, y: 58, w: 4, h: 4 },
    { code: 'E2', zone: 'E', size: 'small', x: 64, y: 58, w: 4, h: 4 },
    { code: 'E3', zone: 'E', size: 'small', x: 68, y: 58, w: 4, h: 4 },
    { code: 'E4', zone: 'E', size: 'small', x: 72, y: 55, w: 4, h: 4 },
    { code: 'E5', zone: 'E', size: 'small', x: 76, y: 55, w: 4, h: 4 },

    // โซน F - บ่อขนาดเล็ก (ขวาบน)
    { code: 'F1', zone: 'F', size: 'small', x: 55, y: 45, w: 4, h: 4 },
    { code: 'F2', zone: 'F', size: 'small', x: 55, y: 38, w: 4, h: 4 },
    { code: 'F3', zone: 'F', size: 'small', x: 55, y: 32, w: 4, h: 4 },
    { code: 'F4', zone: 'F', size: 'small', x: 55, y: 26, w: 4, h: 4 },
    { code: 'F5', zone: 'F', size: 'small', x: 55, y: 20, w: 4, h: 4 },
    { code: 'F6', zone: 'F', size: 'small', x: 60, y: 15, w: 4, h: 4 },
    { code: 'F7', zone: 'F', size: 'small', x: 64, y: 10, w: 4, h: 4 },
    { code: 'F8', zone: 'F', size: 'small', x: 60, y: 5, w: 4, h: 4 },

    // โซน G - บ่อขนาดเล็ก (ขวา)
    { code: 'G1', zone: 'G', size: 'small', x: 75, y: 12, w: 5, h: 5 },
    { code: 'G2', zone: 'G', size: 'medium', x: 72, y: 38, w: 8, h: 8 },
    { code: 'G3', zone: 'G', size: 'small', x: 82, y: 12, w: 4, h: 4 },
    { code: 'G4', zone: 'G', size: 'small', x: 82, y: 17, w: 4, h: 4 },
    { code: 'G5', zone: 'G', size: 'small', x: 82, y: 22, w: 4, h: 4 },
    { code: 'G6', zone: 'G', size: 'small', x: 82, y: 27, w: 4, h: 4 },
    { code: 'G7', zone: 'G', size: 'small', x: 82, y: 32, w: 4, h: 4 },
    { code: 'G8', zone: 'G', size: 'small', x: 82, y: 37, w: 4, h: 4 },
    { code: 'G10', zone: 'G', size: 'small', x: 85, y: 48, w: 4, h: 4 }
  ];

  // Insert ponds
  for (const pond of pondsData) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO ponds (pond_code, zone, size, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [pond.code, pond.zone, pond.size, pond.x, pond.y, pond.w, pond.h]
    });
  }
  console.log(`✅ เพิ่มข้อมูลบ่อทั้งหมด ${pondsData.length} บ่อ\n`);

  // สรุปจำนวนบ่อแต่ละโซน
  const zoneCounts = await db.execute(`SELECT zone, COUNT(*) as count FROM ponds GROUP BY zone ORDER BY zone`);

  console.log('📊 สรุปจำนวนบ่อแต่ละโซน:');
  zoneCounts.rows.forEach(z => {
    console.log(`   โซน ${z.zone}: ${z.count} บ่อ`);
  });

  const totalPonds = await db.execute('SELECT COUNT(*) as total FROM ponds');
  console.log(`\n   รวมทั้งหมด: ${totalPonds.rows[0].total} บ่อ`);

  console.log('\n✅ สร้างฐานข้อมูลเสร็จสมบูรณ์!');
  console.log('\n📝 ข้อมูล Admin สำหรับเข้าสู่ระบบ:');
  console.log('   Username: admin');
  console.log(`   Password: ${adminPassword}`);
  console.log('\n⚠️  กรุณาเปลี่ยนรหัสผ่านหลังจากเข้าสู่ระบบครั้งแรก!');
}

initDatabase().catch(console.error);
