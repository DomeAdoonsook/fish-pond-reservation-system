const Reservation = require('../models/Reservation');
const { sendExpiryReminder } = require('./lineNotify');

// ตรวจสอบการจองที่หมดอายุและใกล้หมดอายุ
async function checkExpiredReservations() {
  try {
    // อัพเดทการจองที่หมดอายุแล้ว
    const result = Reservation.completeExpired();
    if (result.changes > 0) {
      console.log(`✅ Completed ${result.changes} expired reservations`);
    }

    // ส่งแจ้งเตือนการจองที่ใกล้หมดอายุ
    const expiringSoon = Reservation.getExpiringSoon();
    for (const reservation of expiringSoon) {
      // แจ้งเตือนเมื่อเหลือ 7 วัน และ 1 วัน
      if (reservation.days_remaining === 7 || reservation.days_remaining === 1) {
        await sendExpiryReminder(reservation, reservation.days_remaining);
      }
    }

    console.log(`📅 Checked ${expiringSoon.length} reservations expiring soon`);
  } catch (error) {
    console.error('Error in checkExpiredReservations:', error);
  }
}

module.exports = {
  checkExpiredReservations
};
