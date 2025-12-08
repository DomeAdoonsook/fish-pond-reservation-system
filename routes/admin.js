const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const Log = require('../models/Log');

// Middleware ตรวจสอบ login
const requireLogin = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
};

// หน้า Login
router.get('/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: null });
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = Admin.authenticate(username, password);

  if (!admin) {
    return res.render('admin/login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  req.session.admin = admin;
  res.redirect('/admin');
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// หน้าหลัก - Dashboard
router.get('/', requireLogin, (req, res) => {
  const ponds = Pond.getAll();
  const status = Pond.getStatusCount();
  const pendingCount = Reservation.getPending().length;

  res.render('admin/dashboard', {
    admin: req.session.admin,
    ponds,
    status,
    pendingCount,
    page: 'dashboard'
  });
});

// หน้าอนุมัติคำขอ
router.get('/requests', requireLogin, (req, res) => {
  const pending = Reservation.getPending();
  const pendingCount = pending.length;

  res.render('admin/requests', {
    admin: req.session.admin,
    reservations: pending,
    pendingCount,
    page: 'requests'
  });
});

// อนุมัติคำขอ
router.post('/requests/:id/approve', requireLogin, async (req, res) => {
  try {
    Reservation.approve(req.params.id, req.session.admin.id);

    const reservation = Reservation.getById(req.params.id);
    Log.create('reservation_approved', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: req.session.admin.id
    });

    // ส่งแจ้งเตือน LINE
    const { sendApprovalNotification } = require('../utils/lineNotify');
    await sendApprovalNotification(reservation);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ไม่อนุมัติคำขอ
router.post('/requests/:id/reject', requireLogin, async (req, res) => {
  try {
    const reason = req.body.reason || '';
    Reservation.reject(req.params.id, req.session.admin.id, reason);

    const reservation = Reservation.getById(req.params.id);
    Log.create('reservation_rejected', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: req.session.admin.id,
      details: { reason }
    });

    // ส่งแจ้งเตือน LINE
    const { sendRejectionNotification } = require('../utils/lineNotify');
    await sendRejectionNotification(reservation, reason);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าการจอง Active
router.get('/active', requireLogin, (req, res) => {
  const active = Reservation.getActive();
  const pendingCount = Reservation.getPending().length;

  res.render('admin/active', {
    admin: req.session.admin,
    reservations: active,
    pendingCount,
    page: 'active'
  });
});

// คืนบ่อ
router.post('/reservations/:id/complete', requireLogin, (req, res) => {
  try {
    const reservation = Reservation.getById(req.params.id);
    Reservation.complete(req.params.id);

    Log.create('reservation_completed', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: req.session.admin.id
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าประวัติ
router.get('/history', requireLogin, (req, res) => {
  const reservations = Reservation.getAll();
  const pendingCount = Reservation.getPending().length;

  res.render('admin/history', {
    admin: req.session.admin,
    reservations,
    pendingCount,
    page: 'history'
  });
});

// หน้ารายละเอียดบ่อ
router.get('/pond/:id', requireLogin, (req, res) => {
  const pond = Pond.getById(req.params.id);
  const history = Reservation.getHistoryByPondId(req.params.id);
  const pendingCount = Reservation.getPending().length;

  if (!pond) {
    return res.redirect('/admin');
  }

  res.render('admin/pond-detail', {
    admin: req.session.admin,
    pond,
    history,
    pendingCount,
    page: 'pond'
  });
});

// อัพเดทสถานะบ่อ
router.post('/pond/:id/status', requireLogin, (req, res) => {
  try {
    const { status } = req.body;
    Pond.updateStatus(req.params.id, status);

    Log.create('pond_status_change', {
      pond_id: req.params.id,
      admin_id: req.session.admin.id,
      details: { new_status: status }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าตั้งค่า
router.get('/settings', requireLogin, (req, res) => {
  const pendingCount = Reservation.getPending().length;

  res.render('admin/settings', {
    admin: req.session.admin,
    pendingCount,
    page: 'settings'
  });
});

// เปลี่ยนรหัสผ่าน
router.post('/change-password', requireLogin, (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    // ตรวจสอบรหัสผ่านเดิม
    const admin = Admin.authenticate(req.session.admin.username, current_password);
    if (!admin) {
      return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    Admin.changePassword(req.session.admin.id, new_password);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
