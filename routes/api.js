const express = require('express');
const router = express.Router();
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const Log = require('../models/Log');

// ===== PONDS =====

// ดึงบ่อทั้งหมด
router.get('/ponds', (req, res) => {
  try {
    const ponds = Pond.getAll();
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อตาม ID
router.get('/ponds/:id', (req, res) => {
  try {
    const pond = Pond.getById(req.params.id);
    if (!pond) {
      return res.status(404).json({ error: 'Pond not found' });
    }
    res.json(pond);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อตามโซน
router.get('/ponds/zone/:zone', (req, res) => {
  try {
    const ponds = Pond.getByZone(req.params.zone);
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อว่าง
router.get('/ponds-available', (req, res) => {
  try {
    const ponds = Pond.getAvailable();
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อว่างตามโซน
router.get('/ponds-available/:zone', (req, res) => {
  try {
    const ponds = Pond.getAvailableByZone(req.params.zone);
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// สรุปสถานะบ่อ
router.get('/ponds-status', (req, res) => {
  try {
    const status = Pond.getStatusCount();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// สรุปบ่อว่างตามโซน
router.get('/ponds-by-zone', (req, res) => {
  try {
    const zones = Pond.getAvailableCountByZone();
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงรายชื่อโซน
router.get('/zones', (req, res) => {
  try {
    const zones = Pond.getZones();
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// อัพเดทสถานะบ่อ
router.put('/ponds/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['available', 'occupied', 'maintenance'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    Pond.updateStatus(req.params.id, status);
    Log.create('pond_status_change', {
      pond_id: req.params.id,
      details: { new_status: status }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== RESERVATIONS =====

// ดึงการจองทั้งหมด
router.get('/reservations', (req, res) => {
  try {
    const reservations = Reservation.getAll();
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการจองที่รออนุมัติ
router.get('/reservations/pending', (req, res) => {
  try {
    const reservations = Reservation.getPending();
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการจองที่ active
router.get('/reservations/active', (req, res) => {
  try {
    const reservations = Reservation.getActive();
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการจองตาม ID
router.get('/reservations/:id', (req, res) => {
  try {
    const reservation = Reservation.getById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// สร้างการจองใหม่
router.post('/reservations', (req, res) => {
  try {
    const { pond_id, user_name, line_user_id, fish_type, fish_quantity, start_date, end_date, purpose } = req.body;

    // Validation
    if (!pond_id || !user_name || !fish_type || !fish_quantity || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = Reservation.create({
      pond_id,
      user_name,
      line_user_id,
      fish_type,
      fish_quantity,
      start_date,
      end_date,
      purpose
    });

    Log.create('reservation_created', {
      pond_id,
      reservation_id: id,
      user_id: line_user_id,
      details: { user_name, fish_type, fish_quantity }
    });

    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// อนุมัติการจอง
router.post('/reservations/:id/approve', (req, res) => {
  try {
    const adminId = req.body.admin_id || 1; // TODO: get from session
    Reservation.approve(req.params.id, adminId);

    const reservation = Reservation.getById(req.params.id);
    Log.create('reservation_approved', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: adminId
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ไม่อนุมัติการจอง
router.post('/reservations/:id/reject', (req, res) => {
  try {
    const adminId = req.body.admin_id || 1;
    const reason = req.body.reason || '';
    Reservation.reject(req.params.id, adminId, reason);

    const reservation = Reservation.getById(req.params.id);
    Log.create('reservation_rejected', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: adminId,
      details: { reason }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ยกเลิกการจอง
router.post('/reservations/:id/cancel', (req, res) => {
  try {
    const reservation = Reservation.getById(req.params.id);
    Reservation.cancel(req.params.id);

    Log.create('reservation_cancelled', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      user_id: reservation.line_user_id
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// เสร็จสิ้นการจอง (คืนบ่อ)
router.post('/reservations/:id/complete', (req, res) => {
  try {
    const reservation = Reservation.getById(req.params.id);
    Reservation.complete(req.params.id);

    Log.create('reservation_completed', {
      pond_id: reservation.pond_id,
      reservation_id: req.params.id,
      admin_id: req.body.admin_id || 1
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// อัพเดทข้อมูลการจอง
router.put('/reservations/:id', (req, res) => {
  try {
    Reservation.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงประวัติการจองของบ่อ
router.get('/ponds/:id/history', (req, res) => {
  try {
    const history = Reservation.getHistoryByPondId(req.params.id);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== LOGS =====

// ดึง log ทั้งหมด
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = Log.getAll(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
