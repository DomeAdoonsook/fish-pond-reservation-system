const express = require('express');
const router = express.Router();
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const CancellationRequest = require('../models/CancellationRequest');

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

// หน้าฟอร์มขอใช้บ่อ
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

// ส่งคำขอใช้บ่อ
router.post('/booking/:id', async (req, res) => {
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

    // ส่งแจ้งเตือน LINE ให้ admin
    const { notifyAdminNewRequest } = require('../utils/lineNotify');
    const reservation = Reservation.getById(reservationId);
    await notifyAdminNewRequest(reservation);

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

// หน้าฟอร์มขอยกเลิกการใช้บ่อ
router.get('/cancel-request/:reservationId', (req, res) => {
  const reservation = Reservation.getById(req.params.reservationId);

  if (!reservation) {
    return res.redirect('/');
  }

  // ตรวจสอบว่าการใช้บ่อยังดำเนินการอยู่หรือไม่
  if (reservation.status !== 'approved' && reservation.status !== 'pending') {
    return res.redirect('/pond/' + reservation.pond_id + '?error=invalid_status');
  }

  // ตรวจสอบว่ามีคำขอยกเลิกที่รอดำเนินการอยู่แล้วหรือไม่
  if (CancellationRequest.hasPendingRequest(req.params.reservationId)) {
    return res.redirect('/pond/' + reservation.pond_id + '?error=pending_cancel');
  }

  res.render('public/cancel-request', {
    reservation,
    error: null
  });
});

// ส่งคำขอยกเลิกการใช้บ่อ
router.post('/cancel-request/:reservationId', async (req, res) => {
  const reservation = Reservation.getById(req.params.reservationId);

  if (!reservation) {
    return res.redirect('/');
  }

  // ตรวจสอบว่าการใช้บ่อยังดำเนินการอยู่หรือไม่
  if (reservation.status !== 'approved' && reservation.status !== 'pending') {
    return res.redirect('/pond/' + reservation.pond_id);
  }

  // ตรวจสอบว่ามีคำขอยกเลิกที่รอดำเนินการอยู่แล้วหรือไม่
  if (CancellationRequest.hasPendingRequest(req.params.reservationId)) {
    return res.render('public/cancel-request', {
      reservation,
      error: 'มีคำขอยกเลิกที่รอดำเนินการอยู่แล้ว'
    });
  }

  const { reason, phone } = req.body;

  try {
    const requestId = CancellationRequest.create({
      reservation_id: reservation.id,
      reason: reason || null,
      phone: phone || null
    });

    // ส่งแจ้งเตือน LINE ให้ Admin
    const { notifyAdminCancellationRequest } = require('../utils/lineNotify');
    const request = CancellationRequest.getById(requestId);
    await notifyAdminCancellationRequest(request);

    res.redirect('/cancel-request/success/' + requestId);
  } catch (error) {
    console.error('Cancel request error:', error);
    res.render('public/cancel-request', {
      reservation,
      error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
    });
  }
});

// หน้ายืนยันการส่งคำขอยกเลิกสำเร็จ
router.get('/cancel-request/success/:id', (req, res) => {
  const request = CancellationRequest.getById(req.params.id);

  if (!request) {
    return res.redirect('/');
  }

  res.render('public/cancel-request-success', {
    request
  });
});

module.exports = router;
