const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const EquipmentCategory = require('../models/EquipmentCategory');
const EquipmentReservation = require('../models/EquipmentReservation');
const Reservation = require('../models/Reservation');
const CancellationRequest = require('../models/CancellationRequest');
const { sendEquipmentApprovalNotification, sendEquipmentRejectionNotification } = require('../utils/lineNotify');

// Middleware สำหรับเช็ค login
function requireLogin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
}

// Middleware สำหรับเพิ่มข้อมูลพื้นฐาน
async function addCommonData(req, res, next) {
  res.locals.admin = req.session.admin || { name: 'Admin' };
  res.locals.isLoggedIn = !!req.session.admin;
  res.locals.pendingCount = await Reservation.getPendingCount();
  res.locals.cancelPendingCount = await CancellationRequest.getPendingCount();
  res.locals.equipmentPendingCount = await EquipmentReservation.getPendingCount();
  next();
}

router.use(requireLogin);
router.use(addCommonData);

// ===== Equipment Management =====

// หน้าหลัก (4 กล่อง)
router.get('/', async (req, res) => {
  const equipment = await Equipment.getAll();
  const categories = await EquipmentCategory.getAll();
  res.render('admin/equipment/index', { equipment, categories });
});

// รายการอุปกรณ์ทั้งหมด (จัดการ)
router.get('/list', async (req, res) => {
  const equipment = await Equipment.getAll();
  const categories = await EquipmentCategory.getAll();
  res.render('admin/equipment/list', { equipment, categories });
});

// ฟอร์มเพิ่มอุปกรณ์
router.get('/add', async (req, res) => {
  const categories = await EquipmentCategory.getAll();
  res.render('admin/equipment/form', { equipment: null, categories, action: 'add' });
});

// บันทึกอุปกรณ์ใหม่
router.post('/add', async (req, res) => {
  try {
    const { name, category_id, total_quantity, unit, description } = req.body;
    await Equipment.create({
      name,
      category_id: category_id || null,
      total_quantity: parseInt(total_quantity) || 0,
      unit: unit || 'ชิ้น',
      description
    });
    res.redirect('/admin/equipment?success=added');
  } catch (error) {
    console.error('Error adding equipment:', error);
    res.redirect('/admin/equipment?error=add_failed');
  }
});

// ฟอร์มแก้ไขอุปกรณ์
router.get('/:id/edit', async (req, res) => {
  const equipment = await Equipment.getById(req.params.id);
  if (!equipment) {
    return res.redirect('/admin/equipment?error=not_found');
  }
  const categories = await EquipmentCategory.getAll();
  res.render('admin/equipment/form', { equipment, categories, action: 'edit' });
});

// บันทึกการแก้ไขอุปกรณ์
router.post('/:id/edit', async (req, res) => {
  try {
    const { name, category_id, total_quantity, unit, description, status } = req.body;
    await Equipment.update(req.params.id, {
      name,
      category_id: category_id || null,
      total_quantity: parseInt(total_quantity) || 0,
      unit: unit || 'ชิ้น',
      description,
      status: status || 'active'
    });
    res.redirect('/admin/equipment?success=updated');
  } catch (error) {
    console.error('Error updating equipment:', error);
    res.redirect('/admin/equipment?error=update_failed');
  }
});

// ลบอุปกรณ์
router.post('/:id/delete', async (req, res) => {
  try {
    await Equipment.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.json({ success: false, error: error.message });
  }
});

// ===== Category Management =====

// เพิ่มหมวดหมู่
router.post('/categories/add', async (req, res) => {
  try {
    const { name, description } = req.body;
    await EquipmentCategory.create({ name, description });
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding category:', error);
    res.json({ success: false, error: error.message });
  }
});

// แก้ไขหมวดหมู่
router.post('/categories/:id/edit', async (req, res) => {
  try {
    const { name, description } = req.body;
    await EquipmentCategory.update(req.params.id, { name, description });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating category:', error);
    res.json({ success: false, error: error.message });
  }
});

// ลบหมวดหมู่
router.post('/categories/:id/delete', async (req, res) => {
  try {
    await EquipmentCategory.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.json({ success: false, error: error.message });
  }
});

// ===== Equipment Reservation Management =====

// คำขอยืมรออนุมัติ
router.get('/requests', async (req, res) => {
  const requests = await EquipmentReservation.getPending();
  res.render('admin/equipment/requests', { requests });
});

// อนุมัติคำขอยืม
router.post('/requests/:id/approve', async (req, res) => {
  try {
    const reservation = await EquipmentReservation.getById(req.params.id);
    if (!reservation) {
      return res.json({ success: false, error: 'ไม่พบคำขอ' });
    }

    // เช็คจำนวนอุปกรณ์ว่างก่อนอนุมัติ
    const items = await EquipmentReservation.getItems(req.params.id);
    for (const item of items) {
      const available = await Equipment.checkAvailability(item.equipment_id, reservation.borrow_date, reservation.return_date);
      if (available < item.quantity) {
        return res.json({
          success: false,
          error: `อุปกรณ์ "${item.equipment_name}" ไม่เพียงพอ (ต้องการ ${item.quantity}, ว่าง ${available})`
        });
      }
    }

    await EquipmentReservation.approve(req.params.id, req.session.admin.id);

    // ส่งแจ้งเตือน LINE
    if (reservation.line_user_id) {
      try {
        await sendEquipmentApprovalNotification(reservation.line_user_id, reservation);
      } catch (e) {
        console.error('Error sending LINE notification:', e);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error approving equipment request:', error);
    res.json({ success: false, error: error.message });
  }
});

// ปฏิเสธคำขอยืม
router.post('/requests/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const reservation = await EquipmentReservation.getById(req.params.id);
    if (!reservation) {
      return res.json({ success: false, error: 'ไม่พบคำขอ' });
    }

    await EquipmentReservation.reject(req.params.id, req.session.admin.id, reason);

    // ส่งแจ้งเตือน LINE
    if (reservation.line_user_id) {
      try {
        await sendEquipmentRejectionNotification(reservation.line_user_id, reservation, reason);
      } catch (e) {
        console.error('Error sending LINE notification:', e);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting equipment request:', error);
    res.json({ success: false, error: error.message });
  }
});

// รายการกำลังยืม
router.get('/borrowed', async (req, res) => {
  const borrowed = await EquipmentReservation.getBorrowed();
  res.render('admin/equipment/borrowed', { borrowed });
});

// บันทึกการคืน
router.post('/borrowed/:id/return', async (req, res) => {
  try {
    await EquipmentReservation.markReturned(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error recording return:', error);
    res.json({ success: false, error: error.message });
  }
});

// ประวัติการยืม
router.get('/history', async (req, res) => {
  const history = await EquipmentReservation.getHistory();
  res.render('admin/equipment/history', { history });
});

module.exports = router;
