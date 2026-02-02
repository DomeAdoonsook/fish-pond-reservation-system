const express = require('express');
const router = express.Router();
const StockCategory = require('../models/StockCategory');
const StockItem = require('../models/StockItem');
const StockRequest = require('../models/StockRequest');

// หน้าหลัก Stock - แสดงรายการวัสดุ
router.get('/', async (req, res) => {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();

    // Group items by category
    const itemsByCategory = {};
    items.forEach(item => {
      const catName = item.category_name || 'ไม่ระบุหมวดหมู่';
      if (!itemsByCategory[catName]) {
        itemsByCategory[catName] = [];
      }
      itemsByCategory[catName].push(item);
    });

    res.render('stock/index', {
      title: 'Stock วัสดุเกษตร',
      page: 'stock',
      categories,
      items,
      itemsByCategory
    });
  } catch (error) {
    console.error('Stock index error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// หน้าขอเบิกวัสดุ
router.get('/request', async (req, res) => {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();

    res.render('stock/request', {
      title: 'ขอเบิกวัสดุ',
      page: 'stock-request',
      categories,
      items
    });
  } catch (error) {
    console.error('Stock request page error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// Submit คำขอเบิก
router.post('/request', async (req, res) => {
  try {
    const { user_name, phone, purpose, items } = req.body;

    if (!user_name || !purpose || !items || items.length === 0) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    // Parse items
    const parsedItems = [];
    for (const item of items) {
      if (item.item_id && item.quantity > 0) {
        parsedItems.push({
          item_id: parseInt(item.item_id),
          quantity: parseFloat(item.quantity)
        });
      }
    }

    if (parsedItems.length === 0) {
      return res.status(400).json({ error: 'กรุณาเลือกวัสดุอย่างน้อย 1 รายการ' });
    }

    const request = await StockRequest.create({
      user_name,
      phone: phone || null,
      purpose,
      items: parsedItems
    });

    // Notify admin
    try {
      const { notifyAdminNewStockRequest } = require('../utils/lineNotify');
      const requestData = await StockRequest.getById(request.id);
      const requestItems = await StockRequest.getItems(request.id);
      await notifyAdminNewStockRequest({
        ...requestData,
        items: requestItems
      });
    } catch (e) {
      console.error('LINE notify error:', e);
    }

    res.json({ success: true, requestId: request.id });
  } catch (error) {
    console.error('Stock request submit error:', error);
    res.status(500).json({ error: error.message || 'เกิดข้อผิดพลาด' });
  }
});

// หน้าตรวจสอบสถานะคำขอ
router.get('/status', async (req, res) => {
  try {
    res.render('stock/status', {
      title: 'ตรวจสอบสถานะการเบิก',
      page: 'stock-status',
      requests: null,
      searchName: null
    });
  } catch (error) {
    console.error('Stock status page error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// ค้นหาคำขอด้วยชื่อ
router.get('/status/search', async (req, res) => {
  try {
    const { name } = req.query;
    let requests = [];

    if (name && name.trim()) {
      const result = await require('../config/database').execute({
        sql: `
          SELECT r.*,
            (SELECT GROUP_CONCAT(i.name || ' x' || ri.requested_quantity, ', ')
             FROM stock_request_items ri
             JOIN stock_items i ON ri.item_id = i.id
             WHERE ri.request_id = r.id) as items_summary
          FROM stock_requests r
          WHERE r.user_name LIKE ?
          ORDER BY r.created_at DESC
          LIMIT 20
        `,
        args: [`%${name.trim()}%`]
      });
      requests = result.rows;
    }

    res.render('stock/status', {
      title: 'ตรวจสอบสถานะการเบิก',
      page: 'stock-status',
      requests,
      searchName: name || null
    });
  } catch (error) {
    console.error('Stock status search error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

// API: ดึงรายการวัสดุตามหมวดหมู่
router.get('/api/items', async (req, res) => {
  try {
    const { category_id } = req.query;
    let items;
    if (category_id) {
      items = await StockItem.getByCategory(parseInt(category_id));
    } else {
      items = await StockItem.getAll();
    }
    res.json(items);
  } catch (error) {
    console.error('Get items API error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// API: ดึงรายละเอียดคำขอเบิก
router.get('/api/request/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await StockRequest.getById(id);
    if (!request) {
      return res.status(404).json({ error: 'ไม่พบคำขอ' });
    }
    const items = await StockRequest.getItems(id);
    res.json({ success: true, request, items });
  } catch (error) {
    console.error('Get request API error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// หน้ารายงานการใช้น้ำมัน
router.get('/fuel-report', async (req, res) => {
  try {
    const db = require('../config/database');
    const { month, year } = req.query;

    // Default to current month/year
    const now = new Date();
    const selectedMonth = month || (now.getMonth() + 1);
    const selectedYear = year || now.getFullYear();

    // Query fuel transactions with equipment details
    const result = await db.execute({
      sql: `
        SELECT
          t.id,
          t.created_at,
          t.quantity,
          t.unit_price,
          t.total_price,
          t.note,
          i.name as item_name,
          i.unit,
          e.name as equipment_name,
          ec.name as equipment_category,
          a.name as admin_name
        FROM stock_transactions t
        JOIN stock_items i ON t.item_id = i.id
        LEFT JOIN equipment e ON t.equipment_id = e.id
        LEFT JOIN equipment_categories ec ON e.category_id = ec.id
        LEFT JOIN admins a ON t.created_by = a.id
        JOIN stock_categories sc ON i.category_id = sc.id
        WHERE t.transaction_type = 'out'
        AND sc.name LIKE '%น้ำมัน%'
        AND strftime('%m', t.created_at) = ?
        AND strftime('%Y', t.created_at) = ?
        ORDER BY t.created_at DESC
      `,
      args: [String(selectedMonth).padStart(2, '0'), String(selectedYear)]
    });

    // Calculate summary
    const transactions = result.rows;
    const totalQuantity = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
    const totalPrice = transactions.reduce((sum, t) => sum + (t.total_price || 0), 0);

    // Group by equipment
    const byEquipment = {};
    transactions.forEach(t => {
      const equipKey = t.equipment_name || 'ไม่ระบุอุปกรณ์';
      if (!byEquipment[equipKey]) {
        byEquipment[equipKey] = {
          equipment_name: t.equipment_name,
          equipment_category: t.equipment_category,
          quantity: 0,
          total_price: 0,
          count: 0
        };
      }
      byEquipment[equipKey].quantity += t.quantity || 0;
      byEquipment[equipKey].total_price += t.total_price || 0;
      byEquipment[equipKey].count += 1;
    });

    res.render('stock/fuel-report', {
      title: 'รายงานการใช้น้ำมัน',
      page: 'fuel-report',
      transactions,
      byEquipment,
      selectedMonth,
      selectedYear,
      totalQuantity,
      totalPrice
    });
  } catch (error) {
    console.error('Fuel report error:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});

module.exports = router;
