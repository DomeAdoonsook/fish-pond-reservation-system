const express = require('express');
const router = express.Router();
const StockCategory = require('../models/StockCategory');
const StockItem = require('../models/StockItem');
const StockRequest = require('../models/StockRequest');
const StockTransaction = require('../models/StockTransaction');
const Reservation = require('../models/Reservation');

// Middleware: Check login
function requireLogin(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
}

// Apply login check to all routes
router.use(requireLogin);

// Middleware: Add common data
router.use(async (req, res, next) => {
  try {
    res.locals.admin = req.session.admin;
    res.locals.isLoggedIn = true;
    res.locals.stockPendingCount = await StockRequest.getPendingCount();
    res.locals.pendingCount = await Reservation.getPendingCount();
    res.locals.cancelPendingCount = 0;
    res.locals.equipmentPendingCount = 0;
    try {
      const CancellationRequest = require('../models/CancellationRequest');
      res.locals.cancelPendingCount = await CancellationRequest.getPendingCount();
    } catch (e) {}
    try {
      const EquipmentReservation = require('../models/EquipmentReservation');
      res.locals.equipmentPendingCount = await EquipmentReservation.getPendingCount();
    } catch (e) {}
    try {
      const { getLineQuota } = require('../utils/lineNotify');
      res.locals.lineQuota = await getLineQuota();
    } catch (e) {}
  } catch (e) {
    res.locals.stockPendingCount = 0;
    res.locals.pendingCount = 0;
  }
  next();
});

// ======= หน้าหลัก Stock (3 กล่อง) =======
router.get('/', async (req, res) => {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();
    const lowStockItems = await StockItem.getLowStock();

    res.render('admin/stock/index', {
      title: 'จัดการ Stock วัสดุ',
      page: 'stock-items',
      categories,
      items,
      lowStockItems
    });
  } catch (error) {
    console.error('Admin stock index error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// ======= รายการวัสดุ (จัดการ) =======
router.get('/items', async (req, res) => {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();
    const lowStockItems = await StockItem.getLowStock();

    res.render('admin/stock/items', {
      title: 'จัดการวัสดุ',
      page: 'stock-items',
      categories,
      items,
      lowStockItems
    });
  } catch (error) {
    console.error('Admin stock items error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// เพิ่มหมวดหมู่
router.post('/category', async (req, res) => {
  try {
    const { name, description } = req.body;
    await StockCategory.create({ name, description });
    res.json({ success: true });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: error.message });
  }
});

// แก้ไขหมวดหมู่
router.put('/category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    await StockCategory.update(id, { name, description });
    res.json({ success: true });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ลบหมวดหมู่
router.delete('/category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await StockCategory.delete(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: error.message });
  }
});

// เพิ่มวัสดุ
router.post('/item', async (req, res) => {
  try {
    const { name, category_id, unit, unit_price, current_quantity, min_quantity, description } = req.body;
    const result = await StockItem.create({
      name,
      category_id: category_id || null,
      unit: unit || 'หน่วย',
      unit_price: parseFloat(unit_price) || 0,
      current_quantity: parseFloat(current_quantity) || 0,
      min_quantity: parseFloat(min_quantity) || 0,
      description
    });
    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: error.message });
  }
});

// แก้ไขวัสดุ
router.put('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id, unit, unit_price, min_quantity, description, status } = req.body;
    await StockItem.update(id, {
      name,
      category_id: category_id || null,
      unit,
      unit_price: parseFloat(unit_price) || 0,
      min_quantity: parseFloat(min_quantity) || 0,
      description,
      status
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ลบวัสดุ
router.delete('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await StockItem.delete(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ======= คำขอเบิก =======
router.get('/requests', async (req, res) => {
  try {
    const { status } = req.query;
    const requests = await StockRequest.getAll(status || null);

    res.render('admin/stock/requests', {
      title: 'คำขอเบิกวัสดุ',
      page: 'stock-requests',
      requests,
      filterStatus: status || 'all'
    });
  } catch (error) {
    console.error('Admin stock requests error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// ดูรายละเอียดคำขอ
router.get('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await StockRequest.getById(id);
    if (!request) {
      return res.status(404).json({ error: 'ไม่พบคำขอ' });
    }
    const items = await StockRequest.getItems(id);
    res.json({ success: true, request, items });
  } catch (error) {
    console.error('Get request detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// อนุมัติคำขอ
router.post('/requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    const adminId = req.session.admin?.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนที่อนุมัติ' });
    }

    await StockRequest.approve(id, adminId, items);

    // Notify user via LINE if available
    try {
      const request = await StockRequest.getById(id);
      if (request.line_user_id) {
        const { notifyStockRequestApproved } = require('../utils/lineNotify');
        await notifyStockRequestApproved(request);
      }
    } catch (e) {
      console.error('LINE notify error:', e);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ปฏิเสธคำขอ
router.post('/requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.session.admin?.id;

    await StockRequest.reject(id, adminId, reason);

    // Notify user via LINE if available
    try {
      const request = await StockRequest.getById(id);
      if (request.line_user_id) {
        const { notifyStockRequestRejected } = require('../utils/lineNotify');
        await notifyStockRequestRejected(request);
      }
    } catch (e) {
      console.error('LINE notify error:', e);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ======= รับ-จ่าย Stock =======
router.get('/transactions', async (req, res) => {
  try {
    const items = await StockItem.getAll();
    const transactions = await StockTransaction.getAll(50);

    res.render('admin/stock/transactions', {
      title: 'รับ-จ่าย Stock',
      page: 'stock-transactions',
      items,
      transactions
    });
  } catch (error) {
    console.error('Admin stock transactions error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// รับ Stock เข้า
router.post('/stock-in', async (req, res) => {
  try {
    const { item_id, quantity, unit_price, reference_no, note } = req.body;
    const adminId = req.session.admin?.id;

    await StockTransaction.stockIn(
      parseInt(item_id),
      parseFloat(quantity),
      parseFloat(unit_price) || 0,
      reference_no,
      note,
      adminId
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Stock in error:', error);
    res.status(500).json({ error: error.message });
  }
});

// จ่าย Stock ออก
router.post('/stock-out', async (req, res) => {
  try {
    const { item_id, quantity, note } = req.body;
    const adminId = req.session.admin?.id;

    await StockTransaction.stockOut(
      parseInt(item_id),
      parseFloat(quantity),
      note,
      adminId
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Stock out error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ปรับยอด Stock
router.post('/stock-adjust', async (req, res) => {
  try {
    const { item_id, new_quantity, note } = req.body;
    const adminId = req.session.admin?.id;

    await StockTransaction.adjust(
      parseInt(item_id),
      parseFloat(new_quantity),
      note,
      adminId
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Stock adjust error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
