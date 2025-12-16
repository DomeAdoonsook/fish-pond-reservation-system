const express = require('express');
const router = express.Router();
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');

// หน้าแรก - ผังบ่อ
router.get('/', (req, res) => {
  const ponds = Pond.getAll();
  const status = Pond.getStatusCount();
  const pendingCount = Reservation.getPending().length;
  const savedPositions = Pond.getPositions();

  res.render('public/index', {
    ponds,
    status,
    pendingCount,
    savedPositions
  });
});

// หน้ารายละเอียดบ่อ
router.get('/pond/:id', (req, res) => {
  const pond = Pond.getById(req.params.id);
  const history = Reservation.getHistoryByPondId(req.params.id);

  if (!pond) {
    return res.redirect('/');
  }

  res.render('public/pond-detail', {
    pond,
    history
  });
});

// หน้ากำลังใช้งาน
router.get('/active', (req, res) => {
  const active = Reservation.getActive();

  res.render('public/active', {
    reservations: active
  });
});

// หน้าประวัติ
router.get('/history', (req, res) => {
  const reservations = Reservation.getAll();

  res.render('public/history', {
    reservations
  });
});

// หน้าฟอร์มจองบ่อ
router.get('/booking/:id', (req, res) => {
  const pond = Pond.getById(req.params.id);

  if (!pond) {
    return res.redirect('/');
  }

  // ตรวจสอบว่าบ่อว่างหรือไม่
  if (pond.status === 'maintenance') {
    return res.redirect('/pond/' + req.params.id + '?error=maintenance');
  }

  if (pond.user_name) {
    return res.redirect('/pond/' + req.params.id + '?error=occupied');
  }

  res.render('public/booking', {
    pond,
    error: null
  });
});

// ส่งคำขอจอง
router.post('/booking/:id', (req, res) => {
  const pond = Pond.getById(req.params.id);

  if (!pond) {
    return res.redirect('/');
  }

  // ตรวจสอบว่าบ่อว่างหรือไม่
  if (pond.status === 'maintenance' || pond.user_name) {
    return res.redirect('/pond/' + req.params.id);
  }

  const { user_name, phone, fish_type, fish_quantity, start_date, end_date, purpose } = req.body;

  // Validate
  if (!user_name || !phone || !fish_type || !fish_quantity || !start_date || !end_date) {
    return res.render('public/booking', {
      pond,
      error: 'กรุณากรอกข้อมูลให้ครบถ้วน'
    });
  }

  try {
    const reservationId = Reservation.create({
      pond_id: pond.id,
      user_name,
      phone,
      fish_type,
      fish_quantity: parseInt(fish_quantity),
      start_date,
      end_date,
      purpose: purpose || null
    });

    // TODO: ส่งแจ้งเตือน LINE ให้ admin

    res.redirect('/booking/success/' + reservationId);
  } catch (error) {
    console.error('Booking error:', error);
    res.render('public/booking', {
      pond,
      error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
    });
  }
});

// หน้ายืนยันการส่งคำขอสำเร็จ
router.get('/booking/success/:id', (req, res) => {
  const reservation = Reservation.getById(req.params.id);

  if (!reservation) {
    return res.redirect('/');
  }

  res.render('public/booking-success', {
    reservation
  });
});

module.exports = router;
