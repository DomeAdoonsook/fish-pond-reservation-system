const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const EquipmentCategory = require('../models/EquipmentCategory');
const EquipmentReservation = require('../models/EquipmentReservation');
const { notifyAdminNewEquipmentRequest } = require('../utils/lineNotify');

// รายการอุปกรณ์ทั้งหมด
router.get('/', (req, res) => {
  const categories = EquipmentCategory.getWithAvailableEquipment();
  const equipment = Equipment.getActive();
  res.render('public/equipment/index', { categories, equipment });
});

// ฟอร์มยืมอุปกรณ์
router.get('/borrow', (req, res) => {
  const equipment = Equipment.getAvailable();
  const categories = EquipmentCategory.getAll();
  res.render('public/equipment/borrow', { equipment, categories });
});

// ส่งคำขอยืม
router.post('/borrow', async (req, res) => {
  try {
    const { user_name, phone, purpose, borrow_date, return_date, items } = req.body;

    // Validate
    if (!user_name || !borrow_date || !return_date || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    // Parse items if string
    let parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    // เช็คจำนวนว่าง
    for (const item of parsedItems) {
      const available = Equipment.checkAvailability(item.equipment_id, borrow_date, return_date);
      if (available < item.quantity) {
        const eq = Equipment.getById(item.equipment_id);
        return res.status(400).json({
          success: false,
          error: `อุปกรณ์ "${eq ? eq.name : 'ไม่ทราบ'}" ไม่เพียงพอ (ต้องการ ${item.quantity}, ว่าง ${available})`
        });
      }
    }

    // สร้างคำขอ
    const reservation = EquipmentReservation.create({
      user_name,
      phone,
      purpose,
      borrow_date,
      return_date,
      items: parsedItems
    });

    // แจ้ง admin
    try {
      await notifyAdminNewEquipmentRequest(reservation);
    } catch (e) {
      console.error('Error notifying admin:', e);
    }

    res.json({ success: true, id: reservation.id });
  } catch (error) {
    console.error('Error creating equipment reservation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// หน้ายืนยัน
router.get('/borrow/success/:id', (req, res) => {
  const reservation = EquipmentReservation.getById(req.params.id);
  if (!reservation) {
    return res.redirect('/equipment');
  }
  const items = EquipmentReservation.getItems(req.params.id);
  res.render('public/equipment/success', { reservation, items });
});

// API: เช็คจำนวนว่าง
router.get('/api/availability', (req, res) => {
  const { equipment_id, borrow_date, return_date } = req.query;
  if (!equipment_id || !borrow_date || !return_date) {
    return res.json({ available: 0 });
  }
  const available = Equipment.checkAvailability(equipment_id, borrow_date, return_date);
  res.json({ available });
});

// หน้าตรวจสอบสถานะ/ยกเลิก/คืน
router.get('/status', (req, res) => {
  res.render('public/equipment/status');
});

// API: ค้นหาการยืม
router.get('/api/search', (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query.trim()) {
      return res.json({ reservations: [] });
    }

    // ค้นหาจากชื่อหรือหมายเลขคำขอ
    const db = require('../config/database');
    let reservations = [];

    // ถ้าเป็นหมายเลข EQ-xxxx
    const eqMatch = query.toUpperCase().match(/EQ-?(\d+)/);
    if (eqMatch) {
      const id = parseInt(eqMatch[1]);
      const r = EquipmentReservation.getById(id);
      if (r) {
        reservations = [r];
      }
    } else {
      // ค้นหาจากชื่อ
      reservations = db.prepare(`
        SELECT er.*
        FROM equipment_reservations er
        WHERE er.user_name LIKE ?
        ORDER BY er.created_at DESC
        LIMIT 20
      `).all('%' + query + '%');

      // เพิ่ม items ให้แต่ละรายการ
      reservations = reservations.map(r => ({
        ...r,
        items: EquipmentReservation.getItems(r.id)
      }));
    }

    res.json({ reservations });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ยกเลิกการยืม (ผู้ใช้ทั่วไป)
router.post('/cancel/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { reason } = req.body;

    const reservation = EquipmentReservation.getById(id);
    if (!reservation) {
      return res.json({ success: false, error: 'ไม่พบรายการ' });
    }

    // ตรวจสอบสถานะ - ยกเลิกได้เฉพาะ pending หรือ approved
    if (!['pending', 'approved'].includes(reservation.status)) {
      return res.json({ success: false, error: 'ไม่สามารถยกเลิกรายการนี้ได้' });
    }

    // ยกเลิก
    EquipmentReservation.cancel(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel error:', error);
    res.json({ success: false, error: error.message });
  }
});

// แจ้งคืนอุปกรณ์ (ผู้ใช้ทั่วไป)
router.post('/return/:id', (req, res) => {
  try {
    const id = req.params.id;

    const reservation = EquipmentReservation.getById(id);
    if (!reservation) {
      return res.json({ success: false, error: 'ไม่พบรายการ' });
    }

    // ตรวจสอบสถานะ - คืนได้เฉพาะ approved, borrowed หรือ overdue
    if (!['approved', 'borrowed', 'overdue'].includes(reservation.status)) {
      return res.json({ success: false, error: 'ไม่สามารถคืนรายการนี้ได้' });
    }

    // บันทึกการคืน
    EquipmentReservation.markReturned(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Return error:', error);
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
