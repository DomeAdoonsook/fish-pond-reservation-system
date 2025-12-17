const express = require('express');
const router = express.Router();
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const Log = require('../models/Log');

// ===== PONDS =====

// ดึงบ่อทั้งหมด
router.get('/ponds', async (req, res) => {
  try {
    const ponds = await Pond.getAll();
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อตาม ID
router.get('/ponds/:id', async (req, res) => {
  try {
    const pond = await Pond.getById(req.params.id);
    if (!pond) {
      return res.status(404).json({ error: 'Pond not found' });
    }
    res.json(pond);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อตามโซน
router.get('/ponds/zone/:zone', async (req, res) => {
  try {
    const ponds = await Pond.getByZone(req.params.zone);
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อว่าง
router.get('/ponds-available', async (req, res) => {
  try {
    const ponds = await Pond.getAvailable();
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงบ่อว่างตามโซน
router.get('/ponds-available/:zone', async (req, res) => {
  try {
    const ponds = await Pond.getAvailableByZone(req.params.zone);
    res.json(ponds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// สรุปสถานะบ่อ
router.get('/ponds-status', async (req, res) => {
  try {
    const status = await Pond.getStatusCount();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// สรุปบ่อว่างตามโซน
router.get('/ponds-by-zone', async (req, res) => {
  try {
    const zones = await Pond.getAvailableCountByZone();
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงรายชื่อโซน
router.get('/zones', async (req, res) => {
  try {
    const zones = await Pond.getZones();
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// อัพเดทสถานะบ่อ
router.put('/ponds/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['available', 'occupied', 'maintenance'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await Pond.updateStatus(req.params.id, status);
    await Log.create('pond_status_change', {
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
router.get('/reservations', async (req, res) => {
  try {
    const reservations = await Reservation.getAll();
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการจองที่รออนุมัติ
router.get('/reservations/pending', async (req, res) => {
  try {
    const reservations = await Reservation.getPending();
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการจองที่ active
router.get('/reservations/active', async (req, res) => {
  try {
    const reservations = await Reservation.getActive();
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงการจองตาม ID
router.get('/reservations/:id', async (req, res) => {
  try {
    const reservation = await Reservation.getById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// สร้างการจองใหม่
router.post('/reservations', async (req, res) => {
  try {
    const { pond_id, user_name, line_user_id, fish_type, fish_quantity, start_date, end_date, purpose } = req.body;

    // Validation
    if (!pond_id || !user_name || !fish_type || !fish_quantity || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = await Reservation.create({
      pond_id,
      user_name,
      line_user_id,
      fish_type,
      fish_quantity,
      start_date,
      end_date,
      purpose
    });

    await Log.create('reservation_created', {
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
router.post('/reservations/:id/approve', async (req, res) => {
  try {
    const adminId = req.body.admin_id || 1; // TODO: get from session
    await Reservation.approve(req.params.id, adminId);

    const reservation = await Reservation.getById(req.params.id);
    await Log.create('reservation_approved', {
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
router.post('/reservations/:id/reject', async (req, res) => {
  try {
    const adminId = req.body.admin_id || 1;
    const reason = req.body.reason || '';
    await Reservation.reject(req.params.id, adminId, reason);

    const reservation = await Reservation.getById(req.params.id);
    await Log.create('reservation_rejected', {
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
router.post('/reservations/:id/cancel', async (req, res) => {
  try {
    const reservation = await Reservation.getById(req.params.id);
    await Reservation.cancel(req.params.id);

    await Log.create('reservation_cancelled', {
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
router.post('/reservations/:id/complete', async (req, res) => {
  try {
    const reservation = await Reservation.getById(req.params.id);
    await Reservation.complete(req.params.id);

    await Log.create('reservation_completed', {
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
router.put('/reservations/:id', async (req, res) => {
  try {
    await Reservation.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ดึงประวัติการจองของบ่อ
router.get('/ponds/:id/history', async (req, res) => {
  try {
    const history = await Reservation.getHistoryByPondId(req.params.id);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== LOGS =====

// ดึง log ทั้งหมด
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await Log.getAll(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
