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

module.exports = router;
