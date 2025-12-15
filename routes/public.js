const express = require('express');
const router = express.Router();
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');

// หน้าแรก - ผังบ่อ
router.get('/', (req, res) => {
  const ponds = Pond.getAll();
  const status = Pond.getStatusCount();
  const pendingCount = Reservation.getPending().length;

  res.render('public/index', {
    ponds,
    status,
    pendingCount
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

module.exports = router;
