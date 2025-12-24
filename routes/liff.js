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
    const { pondId, startDate, endDate, name, phone, purpose, lineUserId, lineDisplayName } = req.body;

    const reservation = await Reservation.create({
      pond_id: pondId,
      user_name: name || lineDisplayName,
      phone: phone,
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

    const reservation = await EquipmentReservation.create({
      equipment_id: equipmentId,
      quantity: quantity,
      borrower_name: name || lineDisplayName,
      borrower_phone: phone,
      purpose: purpose,
      borrow_date: borrowDate,
      expected_return_date: returnDate,
      line_user_id: lineUserId
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

    const request = await StockRequest.create({
      requester_name: name || lineDisplayName,
      requester_phone: phone,
      purpose: purpose,
      items: items,
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
