const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const CancellationRequest = require('../models/CancellationRequest');
const EquipmentReservation = require('../models/EquipmentReservation');
const StockRequest = require('../models/StockRequest');
const Log = require('../models/Log');

// Middleware ตรวจสอบ login
const requireLogin = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
};

// Middleware สำหรับหน้าสาธารณะ (ดูได้ไม่ต้อง login)
const optionalLogin = (req, res, next) => {
  // ไม่บังคับ login แต่ถ้า login แล้วก็ใช้ได้
  next();
};

// Middleware เพิ่มข้อมูล common ให้ทุกหน้า
const addCommonData = async (req, res, next) => {
  try {
    res.locals.cancelPendingCount = await CancellationRequest.getPendingCount();
  } catch (e) {
    res.locals.cancelPendingCount = 0;
  }

  try {
    res.locals.equipmentPendingCount = await EquipmentReservation.getPendingCount();
  } catch (e) {
    res.locals.equipmentPendingCount = 0;
  }

  // ดึง Stock pending count
  try {
    res.locals.stockPendingCount = await StockRequest.getPendingCount();
  } catch (error) {
    res.locals.stockPendingCount = 0;
  }

  // ดึง LINE quota (เฉพาะ admin ที่ login แล้ว)
  if (req.session.admin) {
    try {
      const { getLineQuota } = require('../utils/lineNotify');
      res.locals.lineQuota = await getLineQuota();
    } catch (error) {
      console.error('Error fetching LINE quota:', error);
      res.locals.lineQuota = null;
    }
  }

  next();
};

router.use(addCommonData);

// หน้า Login
router.get('/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: null });
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.authenticate(username, password);

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

// หน้าหลัก - Dashboard (ไม่ต้อง login)
router.get('/', optionalLogin, async (req, res) => {
  const ponds = await Pond.getAll();
  const status = await Pond.getStatusCount();
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;
  const savedPositions = await Pond.getPositions();

  res.render('admin/dashboard', {
    admin: req.session.admin || { name: 'ผู้เยี่ยมชม' },
    isLoggedIn: !!req.session.admin,
    ponds,
    status,
    pendingCount,
    savedPositions,
    page: 'dashboard'
  });
});

// หน้าอนุมัติคำขอ (ดูได้ไม่ต้อง login)
router.get('/requests', optionalLogin, async (req, res) => {
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;

  res.render('admin/requests', {
    admin: req.session.admin || { name: 'ผู้เยี่ยมชม' },
    isLoggedIn: !!req.session.admin,
    reservations: pending,
    pendingCount,
    page: 'requests'
  });
});

// อนุมัติคำขอ
router.post('/requests/:id/approve', requireLogin, async (req, res) => {
  try {
    await Reservation.approve(req.params.id, req.session.admin.id);

    const reservation = await Reservation.getById(req.params.id);
    await Log.create('reservation_approved', {
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
    await Reservation.reject(req.params.id, req.session.admin.id, reason);

    const reservation = await Reservation.getById(req.params.id);
    await Log.create('reservation_rejected', {
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

// หน้าการจอง Active (ไม่ต้อง login)
router.get('/active', optionalLogin, async (req, res) => {
  const active = await Reservation.getActive();
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;

  res.render('admin/active', {
    admin: req.session.admin || { name: 'ผู้เยี่ยมชม' },
    isLoggedIn: !!req.session.admin,
    reservations: active,
    pendingCount,
    page: 'active'
  });
});

// คืนบ่อ
router.post('/reservations/:id/complete', requireLogin, async (req, res) => {
  try {
    const reservation = await Reservation.getById(req.params.id);
    await Reservation.complete(req.params.id);

    await Log.create('reservation_completed', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: req.session.admin.id
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ยกเลิกการจอง
router.post('/reservations/:id/cancel', requireLogin, async (req, res) => {
  try {
    const reservation = await Reservation.getById(req.params.id);
    const reason = req.body.reason || 'ยกเลิกโดยผู้ดูแลระบบ';

    await Reservation.cancel(req.params.id);

    await Log.create('reservation_cancelled', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: req.session.admin.id,
      details: { reason }
    });

    // ส่งแจ้งเตือน LINE
    const { sendCancellationNotification } = require('../utils/lineNotify');
    await sendCancellationNotification(reservation, reason);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าประวัติ (ไม่ต้อง login)
router.get('/history', optionalLogin, async (req, res) => {
  const reservations = await Reservation.getAll();
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;

  res.render('admin/history', {
    admin: req.session.admin || { name: 'ผู้เยี่ยมชม' },
    isLoggedIn: !!req.session.admin,
    reservations,
    pendingCount,
    page: 'history'
  });
});

// หน้ารายละเอียดบ่อ (ไม่ต้อง login)
router.get('/pond/:id', optionalLogin, async (req, res) => {
  const pond = await Pond.getById(req.params.id);
  const history = await Reservation.getHistoryByPondId(req.params.id);
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;

  if (!pond) {
    return res.redirect('/admin');
  }

  res.render('admin/pond-detail', {
    admin: req.session.admin || { name: 'ผู้เยี่ยมชม' },
    isLoggedIn: !!req.session.admin,
    pond,
    history,
    pendingCount,
    page: 'pond'
  });
});

// อัพเดทสถานะบ่อ
router.post('/pond/:id/status', requireLogin, async (req, res) => {
  try {
    const { status } = req.body;
    await Pond.updateStatus(req.params.id, status);

    await Log.create('pond_status_change', {
      pond_id: req.params.id,
      admin_id: req.session.admin.id,
      details: { new_status: status }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าตั้งค่า (ต้อง login)
router.get('/settings', requireLogin, async (req, res) => {
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;

  res.render('admin/settings', {
    admin: req.session.admin,
    isLoggedIn: true,
    pendingCount,
    page: 'settings'
  });
});

// เปลี่ยนรหัสผ่าน
router.post('/change-password', requireLogin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    // ตรวจสอบรหัสผ่านเดิม
    const admin = await Admin.authenticate(req.session.admin.username, current_password);
    if (!admin) {
      return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    await Admin.changePassword(req.session.admin.id, new_password);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าจัดตำแหน่งบ่อ (ต้อง login)
router.get('/pond-positions', requireLogin, async (req, res) => {
  const ponds = await Pond.getAll();
  const pending = await Reservation.getPending();
  const pendingCount = pending.length;

  res.render('admin/pond-positions', {
    admin: req.session.admin,
    isLoggedIn: true,
    ponds,
    pendingCount,
    page: 'pond-positions'
  });
});

// บันทึกตำแหน่งบ่อ
router.post('/pond-positions', requireLogin, async (req, res) => {
  try {
    const { positions } = req.body;

    // บันทึกตำแหน่งแต่ละบ่อ
    for (const pondCode of Object.keys(positions)) {
      const pos = positions[pondCode];
      await Pond.updatePosition(pondCode, pos.left, pos.top, pos.width, pos.height);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// หน้าคำขอยกเลิก (ดูได้ไม่ต้อง login)
router.get('/cancel-requests', optionalLogin, async (req, res) => {
  const pending = await CancellationRequest.getPending();
  const reservationPending = await Reservation.getPending();
  const pendingCount = reservationPending.length;
  const cancelPendingCount = pending.length;

  res.render('admin/cancel-requests', {
    admin: req.session.admin || { name: 'ผู้เยี่ยมชม' },
    isLoggedIn: !!req.session.admin,
    requests: pending,
    pendingCount,
    cancelPendingCount,
    page: 'cancel-requests'
  });
});

// อนุมัติคำขอยกเลิก
router.post('/cancel-requests/:id/approve', requireLogin, async (req, res) => {
  try {
    const request = await CancellationRequest.getById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'ไม่พบคำขอยกเลิก' });
    }

    // อนุมัติคำขอยกเลิก
    await CancellationRequest.approve(req.params.id, req.session.admin.id);

    // ยกเลิกการจอง
    await Reservation.cancel(request.reservation_id);

    await Log.create('cancellation_request_approved', {
      pond_id: request.pond_id,
      reservation_id: request.reservation_id,
      admin_id: req.session.admin.id,
      details: { cancel_request_id: req.params.id }
    });

    // ส่งแจ้งเตือน LINE
    const { sendCancellationApprovalNotification } = require('../utils/lineNotify');
    await sendCancellationApprovalNotification(request);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ปฏิเสธคำขอยกเลิก
router.post('/cancel-requests/:id/reject', requireLogin, async (req, res) => {
  try {
    const request = await CancellationRequest.getById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'ไม่พบคำขอยกเลิก' });
    }

    const reason = req.body.reason || '';
    await CancellationRequest.reject(req.params.id, req.session.admin.id, reason);

    await Log.create('cancellation_request_rejected', {
      pond_id: request.pond_id,
      reservation_id: request.reservation_id,
      admin_id: req.session.admin.id,
      details: { cancel_request_id: req.params.id, reason }
    });

    // ส่งแจ้งเตือน LINE
    const { sendCancellationRejectionNotification } = require('../utils/lineNotify');
    await sendCancellationRejectionNotification(request, reason);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
