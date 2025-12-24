const express = require('express');
const router = express.Router();
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const Equipment = require('../models/Equipment');
const EquipmentCategory = require('../models/EquipmentCategory');
const EquipmentReservation = require('../models/EquipmentReservation');
const StockItem = require('../models/StockItem');
const StockCategory = require('../models/StockCategory');
const StockRequest = require('../models/StockRequest');

// หน้าหลัก LIFF
router.get('/', (req, res) => {
  res.render('liff/index');
});

// หน้าจองบ่อปลา
router.get('/pond', async (req, res) => {
  try {
    const ponds = await Pond.getAll();
    const availablePonds = ponds.filter(p => p.status === 'available');
    res.render('liff/pond', { ponds: availablePonds });
  } catch (error) {
    console.error('Error loading ponds:', error);
    res.render('liff/error', { message: 'ไม่สามารถโหลดข้อมูลบ่อได้' });
  }
});

// API สร้างการจองบ่อ
router.post('/api/pond/reserve', async (req, res) => {
  try {
    const { pondId, fishType, fishQuantity, startDate, endDate, name, phone, purpose, lineUserId, lineDisplayName } = req.body;

    // Validate required fields
    const pId = parseInt(pondId);
    if (!pId || isNaN(pId)) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกบ่อปลา' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด' });
    }

    const reservation = await Reservation.create({
      pond_id: pId,
      user_name: name || lineDisplayName,
      phone: phone,
      fish_type: fishType || 'ไม่ระบุ',
      fish_quantity: parseInt(fishQuantity) || 0,
      purpose: purpose,
      start_date: startDate,
      end_date: endDate,
      line_user_id: lineUserId
    });

    res.json({ success: true, reservation });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// หน้ายืมอุปกรณ์
router.get('/equipment', async (req, res) => {
  try {
    const categories = await EquipmentCategory.getAll();
    const equipment = await Equipment.getAll();
    res.render('liff/equipment', { categories, equipment });
  } catch (error) {
    console.error('Error loading equipment:', error);
    res.render('liff/error', { message: 'ไม่สามารถโหลดข้อมูลอุปกรณ์ได้' });
  }
});

// API สร้างการยืมอุปกรณ์
router.post('/api/equipment/borrow', async (req, res) => {
  try {
    const { equipmentId, quantity, borrowDate, returnDate, name, phone, purpose, lineUserId, lineDisplayName } = req.body;

    // Validate required fields
    const eqId = parseInt(equipmentId);
    const qty = parseInt(quantity) || 1;

    if (!eqId || isNaN(eqId)) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกอุปกรณ์' });
    }
    if (!borrowDate || !returnDate) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุวันที่ยืมและวันที่คืน' });
    }

    // สร้าง items array
    const items = [{
      equipment_id: eqId,
      quantity: qty
    }];

    const reservation = await EquipmentReservation.create({
      user_name: name || lineDisplayName,
      phone: phone,
      purpose: purpose,
      borrow_date: borrowDate,
      return_date: returnDate,
      line_user_id: lineUserId,
      items: items
    });

    res.json({ success: true, reservation });
  } catch (error) {
    console.error('Error creating equipment reservation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// หน้าเบิกวัสดุ
router.get('/stock', async (req, res) => {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();
    res.render('liff/stock', { categories, items });
  } catch (error) {
    console.error('Error loading stock:', error);
    res.render('liff/error', { message: 'ไม่สามารถโหลดข้อมูลวัสดุได้' });
  }
});

// API สร้างคำขอเบิกวัสดุ
router.post('/api/stock/request', async (req, res) => {
  try {
    const { items, name, phone, purpose, lineUserId, lineDisplayName } = req.body;

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกวัสดุที่ต้องการเบิก' });
    }

    // Validate each item has valid item_id and quantity
    const validatedItems = items.map(item => ({
      item_id: parseInt(item.item_id),
      quantity: parseInt(item.quantity) || 1
    })).filter(item => item.item_id && !isNaN(item.item_id));

    if (validatedItems.length === 0) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกวัสดุที่ถูกต้อง' });
    }

    const request = await StockRequest.create({
      user_name: name || lineDisplayName,
      phone: phone,
      purpose: purpose,
      items: validatedItems,
      line_user_id: lineUserId
    });

    res.json({ success: true, request });
  } catch (error) {
    console.error('Error creating stock request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// หน้าดูการจองของฉัน
router.get('/my-bookings', (req, res) => {
  res.render('liff/my-bookings');
});

// API ดึงการจองของผู้ใช้
router.get('/api/my-bookings/:lineUserId', async (req, res) => {
  try {
    const { lineUserId } = req.params;

    const pondReservations = await Reservation.getByLineUserId(lineUserId);
    const equipmentReservations = await EquipmentReservation.getByLineUserId(lineUserId);
    const stockRequests = await StockRequest.getByLineUserId(lineUserId);

    res.json({
      success: true,
      ponds: pondReservations || [],
      equipment: equipmentReservations || [],
      stock: stockRequests || []
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// หน้าเช็ควัสดุคงคลัง
router.get('/stock-check', async (req, res) => {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();
    res.render('liff/stock-check', { categories, items });
  } catch (error) {
    console.error('Error loading stock:', error);
    res.render('liff/error', { message: 'ไม่สามารถโหลดข้อมูลวัสดุได้' });
  }
});

// หน้าช่วยเหลือ
router.get('/help', (req, res) => {
  res.render('liff/help');
});

module.exports = router;
