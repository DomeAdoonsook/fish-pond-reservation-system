const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const UserSession = require('../models/UserSession');
const Log = require('../models/Log');
const Equipment = require('../models/Equipment');
const EquipmentCategory = require('../models/EquipmentCategory');
const EquipmentReservation = require('../models/EquipmentReservation');
const StockItem = require('../models/StockItem');
const StockCategory = require('../models/StockCategory');
const StockRequest = require('../models/StockRequest');

// LINE Config
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};

// Log config status
console.log('🔧 LINE Config loaded:', {
  hasAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
  hasChannelSecret: !!process.env.LINE_CHANNEL_SECRET
});

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
});

// Webhook endpoint
router.post('/', (req, res, next) => {
  // Check if LINE credentials are configured
  if (!process.env.LINE_CHANNEL_SECRET) {
    console.error('❌ LINE_CHANNEL_SECRET is not configured');
    return res.status(200).send('OK'); // Return 200 to avoid LINE retry
  }
  next();
}, line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// Handle events
async function handleEvent(event) {
  const userId = event.source.userId;

  // Log User ID เพื่อใช้เพิ่ม Admin
  console.log('📩 Received event from User ID:', userId);

  if (event.type === 'message' && event.message.type === 'text') {
    return handleTextMessage(event, userId);
  }

  if (event.type === 'postback') {
    return handlePostback(event, userId);
  }

  return null;
}

// Handle text messages
async function handleTextMessage(event, userId) {
  const text = event.message.text.trim();
  const session = await UserSession.get(userId);
  const state = session?.state || 'idle';
  const data = session?.data || {};

  // ตรวจสอบ state การสนทนา
  if (state !== 'idle') {
    return handleConversationFlow(event, userId, state, data, text);
  }

  // คำสั่งหลัก
  const lowerText = text.toLowerCase();

  if (lowerText === 'เมนู' || lowerText === 'menu' || lowerText === 'help') {
    return showMainMenu(event.replyToken);
  }

  if (lowerText.includes('จองบ่อ') || lowerText.includes('ขอใช้บ่อ')) {
    return startBookingFlow(event.replyToken, userId);
  }

  if (lowerText.includes('ยืมอุปกรณ์') || lowerText.includes('ยืม') || lowerText.includes('อุปกรณ์')) {
    return startEquipmentBorrowFlow(event.replyToken, userId);
  }

  if (lowerText.includes('ยกเลิก') || lowerText.includes('cancel')) {
    return showUserReservations(event.replyToken, userId, 'cancel');
  }

  if (lowerText.includes('สถานะ') || lowerText.includes('status')) {
    return showUserReservations(event.replyToken, userId, 'status');
  }

  if (lowerText.includes('ว่าง') || lowerText.includes('available')) {
    return showAvailablePonds(event.replyToken);
  }

  // Stock commands
  if (lowerText.includes('สต็อก') || lowerText.includes('stock') || lowerText.includes('วัสดุ') || lowerText.includes('เช็ควัสดุ')) {
    return showStockSummary(event.replyToken);
  }

  if (lowerText.includes('เบิก') || lowerText.includes('ขอเบิก')) {
    return startStockRequestFlow(event.replyToken, userId);
  }

  if (lowerText.includes('คำขอเบิก') || lowerText.includes('สถานะเบิก')) {
    return showUserStockRequests(event.replyToken, userId);
  }

  // Default - show menu
  return showMainMenu(event.replyToken);
}

// Handle postback
async function handlePostback(event, userId) {
  const data = event.postback.data;
  const params = new URLSearchParams(data);
  const action = params.get('action');

  switch (action) {
    case 'menu':
      return showMainMenu(event.replyToken);

    case 'book':
      return startBookingFlow(event.replyToken, userId);

    case 'select_zone':
      const zone = params.get('zone');
      return showPondsInZone(event.replyToken, userId, zone);

    case 'select_pond':
      const pondId = params.get('pond_id');
      return startPondBooking(event.replyToken, userId, pondId);

    case 'available':
      return showAvailablePonds(event.replyToken);

    case 'my_status':
      return showUserReservations(event.replyToken, userId, 'status');

    case 'cancel_booking':
      return showUserReservations(event.replyToken, userId, 'cancel');

    case 'confirm_cancel':
      const reservationId = params.get('id');
      return confirmCancelBooking(event.replyToken, userId, reservationId);

    case 'cancel_flow':
      await UserSession.reset(userId);
      return showMainMenu(event.replyToken);

    // Equipment postbacks
    case 'borrow_equipment':
      return startEquipmentBorrowFlow(event.replyToken, userId);

    case 'select_eq_category':
      const catId = params.get('cat_id');
      return showEquipmentInCategory(event.replyToken, userId, catId);

    case 'select_equipment':
      const eqId = params.get('eq_id');
      return startEquipmentSelection(event.replyToken, userId, eqId);

    case 'my_equipment':
      return showUserEquipmentReservations(event.replyToken, userId);

    // Stock postbacks
    case 'check_stock':
      return showStockSummary(event.replyToken);

    case 'request_stock':
      return startStockRequestFlow(event.replyToken, userId);

    case 'select_stock_category':
      const stockCatId = params.get('cat_id');
      return showStockItemsInCategory(event.replyToken, userId, stockCatId);

    case 'select_stock_item':
      const stockItemId = params.get('item_id');
      return startStockItemSelection(event.replyToken, userId, stockItemId);

    case 'my_stock_requests':
      return showUserStockRequests(event.replyToken, userId);

    default:
      return showMainMenu(event.replyToken);
  }
}

// Handle conversation flow
async function handleConversationFlow(event, userId, state, data, text) {
  switch (state) {
    case 'awaiting_name':
      data.user_name = text;
      await UserSession.set(userId, 'awaiting_fish_type', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '🐟 กรุณาระบุชนิดปลาที่จะเลี้ยง\n\nตัวอย่าง: ปลานิล, ปลาดุก, ปลาทับทิม'
        }]
      });

    case 'awaiting_fish_type':
      data.fish_type = text;
      await UserSession.set(userId, 'awaiting_quantity', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '🔢 กรุณาระบุจำนวนปลา (ตัว)\n\nตัวอย่าง: 500'
        }]
      });

    case 'awaiting_quantity':
      const quantity = parseInt(text);
      if (isNaN(quantity) || quantity <= 0) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '❌ กรุณาระบุจำนวนเป็นตัวเลขที่มากกว่า 0'
          }]
        });
      }
      data.fish_quantity = quantity;
      await UserSession.set(userId, 'awaiting_start_date', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '📅 กรุณาระบุวันที่ลงลูกปลา\n\nรูปแบบ: วัน/เดือน/ปี\nตัวอย่าง: 15/12/2567'
        }]
      });

    case 'awaiting_start_date':
      const startDate = parseThaiDate(text);
      if (!startDate) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '❌ รูปแบบวันที่ไม่ถูกต้อง\n\nกรุณาระบุในรูปแบบ: วัน/เดือน/ปี\nตัวอย่าง: 15/12/2567'
          }]
        });
      }
      data.start_date = startDate;
      await UserSession.set(userId, 'awaiting_duration', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '⏱️ กรุณาระบุระยะเวลาที่ต้องการใช้บ่อ (เดือน)\n\nตัวอย่าง: 3'
        }]
      });

    case 'awaiting_duration':
      const duration = parseInt(text);
      if (isNaN(duration) || duration <= 0 || duration > 12) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '❌ กรุณาระบุระยะเวลา 1-12 เดือน'
          }]
        });
      }
      data.duration = duration;

      // คำนวณวันสิ้นสุด
      const startDateObj = new Date(data.start_date);
      const endDateObj = new Date(startDateObj);
      endDateObj.setMonth(endDateObj.getMonth() + duration);
      data.end_date = endDateObj.toISOString().split('T')[0];

      // แสดงสรุปและยืนยัน
      return showBookingConfirmation(event.replyToken, userId, data);

    case 'awaiting_confirm':
      if (text === 'ยืนยัน' || text.toLowerCase() === 'yes' || text === 'ใช่') {
        return createReservation(event.replyToken, userId, data);
      } else if (text === 'ยกเลิก' || text.toLowerCase() === 'no' || text === 'ไม่') {
        await UserSession.reset(userId);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '❌ ยกเลิกการขอใช้บ่อแล้ว'
          }]
        });
      } else {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: 'กรุณาพิมพ์ "ยืนยัน" เพื่อยืนยันการขอใช้บ่อ\nหรือ "ยกเลิก" เพื่อยกเลิก'
          }]
        });
      }

    // Equipment borrowing flow
    case 'eq_awaiting_quantity':
      const eqQty = parseInt(text);
      if (isNaN(eqQty) || eqQty <= 0) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ กรุณาระบุจำนวนเป็นตัวเลขที่มากกว่า 0' }]
        });
      }
      if (eqQty > data.available) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `❌ จำนวนไม่เพียงพอ (ว่าง ${data.available})` }]
        });
      }
      data.items = data.items || [];
      data.items.push({ equipment_id: data.current_eq_id, quantity: eqQty, name: data.current_eq_name });
      await UserSession.set(userId, 'eq_awaiting_more', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: `✅ เพิ่ม ${data.current_eq_name} x${eqQty} แล้ว\n\nต้องการเพิ่มอุปกรณ์อื่นไหม?\nพิมพ์ "เพิ่ม" หรือ "ต่อไป" เพื่อไปขั้นตอนถัดไป`
        }]
      });

    case 'eq_awaiting_more':
      if (text.includes('เพิ่ม') || text.includes('อื่น')) {
        return startEquipmentBorrowFlow(event.replyToken, userId, data);
      } else {
        await UserSession.set(userId, 'eq_awaiting_borrow_date', data);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '📅 กรุณาระบุวันที่ต้องการยืม\n\nรูปแบบ: วัน/เดือน/ปี\nตัวอย่าง: 15/12/2567' }]
        });
      }

    case 'eq_awaiting_borrow_date':
      const borrowDate = parseThaiDate(text);
      if (!borrowDate) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ รูปแบบวันที่ไม่ถูกต้อง\nตัวอย่าง: 15/12/2567' }]
        });
      }
      data.borrow_date = borrowDate;
      await UserSession.set(userId, 'eq_awaiting_return_date', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '📅 กรุณาระบุวันที่จะคืน\n\nรูปแบบ: วัน/เดือน/ปี\nตัวอย่าง: 20/12/2567' }]
      });

    case 'eq_awaiting_return_date':
      const returnDate = parseThaiDate(text);
      if (!returnDate) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ รูปแบบวันที่ไม่ถูกต้อง\nตัวอย่าง: 20/12/2567' }]
        });
      }
      data.return_date = returnDate;
      await UserSession.set(userId, 'eq_awaiting_name', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '👤 กรุณาระบุชื่อผู้ยืม' }]
      });

    case 'eq_awaiting_name':
      data.user_name = text;
      await UserSession.set(userId, 'eq_awaiting_phone', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '📱 กรุณาระบุเบอร์โทรศัพท์\n\nหรือพิมพ์ "ข้าม" หากไม่ต้องการระบุ' }]
      });

    case 'eq_awaiting_phone':
      data.phone = text === 'ข้าม' ? null : text;
      return showEquipmentConfirmation(event.replyToken, userId, data);

    case 'eq_awaiting_confirm':
      if (text === 'ยืนยัน' || text.toLowerCase() === 'yes' || text === 'ใช่') {
        return createEquipmentReservation(event.replyToken, userId, data);
      } else if (text === 'ยกเลิก' || text.toLowerCase() === 'no' || text === 'ไม่') {
        await UserSession.reset(userId);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ ยกเลิกการยืมอุปกรณ์แล้ว' }]
        });
      }
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'กรุณาพิมพ์ "ยืนยัน" เพื่อยืนยัน หรือ "ยกเลิก" เพื่อยกเลิก' }]
      });

    // Stock request flow
    case 'stock_awaiting_quantity':
      const stockQty = parseInt(text);
      if (isNaN(stockQty) || stockQty <= 0) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ กรุณาระบุจำนวนเป็นตัวเลขที่มากกว่า 0' }]
        });
      }
      if (stockQty > data.available) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `❌ จำนวนไม่เพียงพอ (มี ${data.available} ${data.unit})` }]
        });
      }
      data.items = data.items || [];
      data.items.push({ item_id: data.current_item_id, quantity: stockQty, name: data.current_item_name, unit: data.unit });
      await UserSession.set(userId, 'stock_awaiting_more', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: `✅ เพิ่ม ${data.current_item_name} x${stockQty} ${data.unit} แล้ว\n\nต้องการเพิ่มวัสดุอื่นไหม?\nพิมพ์ "เพิ่ม" หรือ "ต่อไป" เพื่อไปขั้นตอนถัดไป`
        }]
      });

    case 'stock_awaiting_more':
      if (text.includes('เพิ่ม') || text.includes('อื่น')) {
        return startStockRequestFlow(event.replyToken, userId, data);
      } else {
        await UserSession.set(userId, 'stock_awaiting_name', data);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '👤 กรุณาระบุชื่อผู้ขอเบิก' }]
        });
      }

    case 'stock_awaiting_name':
      data.user_name = text;
      await UserSession.set(userId, 'stock_awaiting_phone', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '📱 กรุณาระบุเบอร์โทรศัพท์\n\nหรือพิมพ์ "ข้าม" หากไม่ต้องการระบุ' }]
      });

    case 'stock_awaiting_phone':
      data.phone = text === 'ข้าม' ? null : text;
      await UserSession.set(userId, 'stock_awaiting_purpose', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '📝 กรุณาระบุเหตุผล/วัตถุประสงค์ในการขอเบิก' }]
      });

    case 'stock_awaiting_purpose':
      data.purpose = text;
      return showStockRequestConfirmation(event.replyToken, userId, data);

    case 'stock_awaiting_confirm':
      if (text === 'ยืนยัน' || text.toLowerCase() === 'yes' || text === 'ใช่') {
        return createStockRequest(event.replyToken, userId, data);
      } else if (text === 'ยกเลิก' || text.toLowerCase() === 'no' || text === 'ไม่') {
        await UserSession.reset(userId);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '❌ ยกเลิกการขอเบิกวัสดุแล้ว' }]
        });
      }
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'กรุณาพิมพ์ "ยืนยัน" เพื่อยืนยัน หรือ "ยกเลิก" เพื่อยกเลิก' }]
      });

    default:
      await UserSession.reset(userId);
      return showMainMenu(event.replyToken);
  }
}

// Show main menu
async function showMainMenu(replyToken) {
  const status = await Pond.getStatusCount();

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'เมนูหลัก - ระบบขอใช้บ่อเลี้ยงปลา',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '🐟 ระบบขอใช้บ่อเลี้ยงปลา',
            weight: 'bold',
            size: 'lg',
            color: '#1a472a'
          }, {
            type: 'text',
            text: 'คณะประมง',
            size: 'sm',
            color: '#666666'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'box',
              layout: 'vertical',
              contents: [{
                type: 'text',
                text: `${status.available}`,
                size: 'xxl',
                weight: 'bold',
                color: '#27ae60',
                align: 'center'
              }, {
                type: 'text',
                text: 'บ่อว่าง',
                size: 'sm',
                color: '#666666',
                align: 'center'
              }],
              flex: 1
            }, {
              type: 'box',
              layout: 'vertical',
              contents: [{
                type: 'text',
                text: `${status.occupied}`,
                size: 'xxl',
                weight: 'bold',
                color: '#e74c3c',
                align: 'center'
              }, {
                type: 'text',
                text: 'ใช้งาน',
                size: 'sm',
                color: '#666666',
                align: 'center'
              }],
              flex: 1
            }, {
              type: 'box',
              layout: 'vertical',
              contents: [{
                type: 'text',
                text: `${status.pending}`,
                size: 'xxl',
                weight: 'bold',
                color: '#f39c12',
                align: 'center'
              }, {
                type: 'text',
                text: 'รออนุมัติ',
                size: 'sm',
                color: '#666666',
                align: 'center'
              }],
              flex: 1
            }]
          }, {
            type: 'separator',
            margin: 'lg'
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#27ae60',
            action: {
              type: 'postback',
              label: '📋 ขอใช้บ่อ',
              data: 'action=book'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '🔍 ดูบ่อว่าง',
              data: 'action=available'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '📊 สถานะการขอใช้บ่อของฉัน',
              data: 'action=my_status'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '❌ ยกเลิกการใช้บ่อ',
              data: 'action=cancel_booking'
            }
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'button',
            style: 'primary',
            color: '#9b59b6',
            action: {
              type: 'postback',
              label: '🔧 ยืมอุปกรณ์',
              data: 'action=borrow_equipment'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '📦 สถานะการยืมอุปกรณ์',
              data: 'action=my_equipment'
            }
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'button',
            style: 'primary',
            color: '#e67e22',
            action: {
              type: 'postback',
              label: '📊 เช็ค Stock วัสดุ',
              data: 'action=check_stock'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '📝 ขอเบิกวัสดุ',
              data: 'action=request_stock'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '📋 สถานะคำขอเบิกของฉัน',
              data: 'action=my_stock_requests'
            }
          }]
        }
      }
    }]
  });
}

// Start booking flow (ขอใช้บ่อ) - show zones
async function startBookingFlow(replyToken, userId) {
  const zones = await Pond.getAvailableCountByZone();

  const zoneButtons = zones.map(z => ({
    type: 'button',
    style: z.available > 0 ? 'primary' : 'secondary',
    color: z.available > 0 ? '#27ae60' : '#bdc3c7',
    action: {
      type: 'postback',
      label: `โซน ${z.zone} (ว่าง ${z.available}/${z.total})`,
      data: `action=select_zone&zone=${z.zone}`
    }
  }));

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'เลือกโซนบ่อ',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📍 เลือกโซนบ่อ',
            weight: 'bold',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: zoneButtons
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '🔙 กลับเมนูหลัก',
              data: 'action=menu'
            }
          }]
        }
      }
    }]
  });
}

// Show ponds in zone
async function showPondsInZone(replyToken, userId, zone) {
  const ponds = await Pond.getAvailableByZone(zone);

  if (ponds.length === 0) {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: `❌ โซน ${zone} ไม่มีบ่อว่างในขณะนี้`
      }]
    });
  }

  const pondButtons = ponds.slice(0, 10).map(p => ({
    type: 'button',
    style: 'primary',
    color: '#27ae60',
    action: {
      type: 'postback',
      label: `บ่อ ${p.pond_code} (${p.size})`,
      data: `action=select_pond&pond_id=${p.id}`
    }
  }));

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: `บ่อว่างในโซน ${zone}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: `🏊 บ่อว่างในโซน ${zone}`,
            weight: 'bold',
            size: 'lg'
          }, {
            type: 'text',
            text: `มี ${ponds.length} บ่อว่าง`,
            size: 'sm',
            color: '#666666'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: pondButtons
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '🔙 เลือกโซนอื่น',
              data: 'action=book'
            }
          }]
        }
      }
    }]
  });
}

// Start pond booking (เริ่มขอใช้บ่อ)
async function startPondBooking(replyToken, userId, pondId) {
  const pond = await Pond.getById(pondId);

  if (!pond || pond.status !== 'available') {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '❌ บ่อนี้ไม่ว่างแล้ว กรุณาเลือกบ่ออื่น'
      }]
    });
  }

  // เริ่ม session การขอใช้บ่อ
  await UserSession.set(userId, 'awaiting_name', {
    pond_id: pondId,
    pond_code: pond.pond_code
  });

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `📝 เริ่มขอใช้บ่อ ${pond.pond_code}\n\n👤 กรุณาระบุชื่อผู้ขอ`
    }]
  });
}

// Show booking confirmation
async function showBookingConfirmation(replyToken, userId, data) {
  await UserSession.set(userId, 'awaiting_confirm', data);

  const startDateThai = formatThaiDate(data.start_date);
  const endDateThai = formatThaiDate(data.end_date);

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'ยืนยันการขอใช้บ่อ',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📋 สรุปการขอใช้บ่อ',
            weight: 'bold',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'บ่อ:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: data.pond_code,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'ผู้ขอ:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: data.user_name,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'ชนิดปลา:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: data.fish_type,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'จำนวน:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: `${data.fish_quantity.toLocaleString()} ตัว`,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'วันลงลูกปลา:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: startDateThai,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'ระยะเวลา:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: `${data.duration} เดือน`,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'สิ้นสุด:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: endDateThai,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'separator',
            margin: 'lg'
          }, {
            type: 'text',
            text: '⚠️ กรุณาตรวจสอบข้อมูลให้ถูกต้อง',
            size: 'sm',
            color: '#e74c3c',
            margin: 'lg'
          }, {
            type: 'text',
            text: 'พิมพ์ "ยืนยัน" เพื่อส่งคำขอใช้บ่อ',
            size: 'sm',
            color: '#666666'
          }, {
            type: 'text',
            text: 'หรือ "ยกเลิก" เพื่อยกเลิก',
            size: 'sm',
            color: '#666666'
          }]
        }
      }
    }]
  });
}

// Create reservation
async function createReservation(replyToken, userId, data) {
  try {
    const reservationId = await Reservation.create({
      pond_id: data.pond_id,
      user_name: data.user_name,
      line_user_id: userId,
      fish_type: data.fish_type,
      fish_quantity: data.fish_quantity,
      start_date: data.start_date,
      end_date: data.end_date
    });

    await Log.create('reservation_created', {
      pond_id: data.pond_id,
      reservation_id: reservationId,
      user_id: userId,
      details: data
    });

    await UserSession.reset(userId);

    // แจ้งเตือน Admin
    const { notifyAdminNewRequest } = require('../utils/lineNotify');
    await notifyAdminNewRequest({
      id: reservationId,
      pond_code: data.pond_code,
      user_name: data.user_name,
      fish_type: data.fish_type,
      fish_quantity: data.fish_quantity
    });

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'ส่งคำขอใช้บ่อเรียบร้อย',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: '✅ ส่งคำขอใช้บ่อเรียบร้อย!',
              weight: 'bold',
              size: 'lg',
              color: '#27ae60'
            }, {
              type: 'text',
              text: `หมายเลขคำขอ: #REQ-${String(reservationId).padStart(4, '0')}`,
              size: 'sm',
              color: '#666666',
              margin: 'md'
            }, {
              type: 'text',
              text: 'กรุณารอการอนุมัติจากเจ้าหน้าที่',
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            }, {
              type: 'text',
              text: 'เราจะแจ้งผลให้ทราบทาง LINE',
              size: 'sm',
              color: '#666666'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'button',
              style: 'primary',
              color: '#27ae60',
              action: {
                type: 'postback',
                label: '🏠 กลับเมนูหลัก',
                data: 'action=menu'
              }
            }]
          }
        }
      }]
    });
  } catch (error) {
    console.error('Create reservation error:', error);
    await UserSession.reset(userId);
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
      }]
    });
  }
}

// Show available ponds
async function showAvailablePonds(replyToken) {
  const zones = await Pond.getAvailableCountByZone();
  const status = await Pond.getStatusCount();

  let zoneText = zones.map(z =>
    `โซน ${z.zone}: ว่าง ${z.available}/${z.total} บ่อ`
  ).join('\n');

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'สรุปบ่อว่าง',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📊 สถานะบ่อปัจจุบัน',
            weight: 'bold',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: `🟢 ว่าง: ${status.available}`,
              size: 'sm'
            }, {
              type: 'text',
              text: `🔴 ใช้งาน: ${status.occupied}`,
              size: 'sm'
            }]
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'text',
            text: zoneText,
            size: 'sm',
            wrap: true,
            margin: 'md'
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#27ae60',
            action: {
              type: 'postback',
              label: '📋 ขอใช้บ่อเลย',
              data: 'action=book'
            }
          }]
        }
      }
    }]
  });
}

// Show user reservations
async function showUserReservations(replyToken, userId, mode) {
  const reservations = await Reservation.getByLineUserId(userId);

  if (reservations.length === 0) {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '📋 คุณยังไม่มีการขอใช้บ่อ'
      }]
    });
  }

  const bubbles = reservations.slice(0, 5).map(r => {
    const statusText = {
      pending: '🟡 รออนุมัติ',
      approved: '🟢 อนุมัติแล้ว',
      rejected: '🔴 ไม่อนุมัติ',
      cancelled: '⚪ ยกเลิก',
      completed: '✅ เสร็จสิ้น'
    }[r.status];

    const contents = {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'text',
          text: `บ่อ ${r.pond_code}`,
          weight: 'bold',
          size: 'lg'
        }, {
          type: 'text',
          text: statusText,
          size: 'sm',
          color: r.status === 'approved' ? '#27ae60' : r.status === 'pending' ? '#f39c12' : '#e74c3c'
        }, {
          type: 'separator',
          margin: 'md'
        }, {
          type: 'text',
          text: `🐟 ${r.fish_type} ${r.fish_quantity.toLocaleString()} ตัว`,
          size: 'sm',
          margin: 'md'
        }]
      }
    };

    // เพิ่มข้อมูลอายุปลาถ้าอนุมัติแล้ว
    if (r.status === 'approved' && r.fish_age_days > 0) {
      contents.body.contents.push({
        type: 'text',
        text: `📅 อายุปลา: ${r.fish_age_days} วัน`,
        size: 'sm',
        color: '#666666'
      });
    }

    // เพิ่มปุ่มยกเลิกถ้าเป็น mode cancel
    if (mode === 'cancel' && (r.status === 'pending' || r.status === 'approved')) {
      contents.footer = {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'button',
          style: 'secondary',
          color: '#e74c3c',
          action: {
            type: 'postback',
            label: '❌ ยกเลิกการใช้บ่อนี้',
            data: `action=confirm_cancel&id=${r.id}`
          }
        }]
      };
    }

    return contents;
  });

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'การขอใช้บ่อของคุณ',
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    }]
  });
}

// Confirm cancel booking
async function confirmCancelBooking(replyToken, userId, reservationId) {
  const reservation = await Reservation.getById(reservationId);

  if (!reservation || reservation.line_user_id !== userId) {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '❌ ไม่พบการใช้บ่อนี้หรือคุณไม่มีสิทธิ์ยกเลิก'
      }]
    });
  }

  await Reservation.cancel(reservationId);

  await Log.create('reservation_cancelled', {
    pond_id: reservation.pond_id,
    reservation_id: reservationId,
    user_id: userId
  });

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `✅ ยกเลิกการใช้บ่อ ${reservation.pond_code} เรียบร้อยแล้ว`
    }]
  });
}

// Helper: Parse Thai date (วว/ดด/ปปปป)
function parseThaiDate(text) {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;

  let [, day, month, year] = match;

  // แปลงปี พ.ศ. เป็น ค.ศ.
  if (parseInt(year) > 2500) {
    year = parseInt(year) - 543;
  }

  const date = new Date(year, parseInt(month) - 1, parseInt(day));
  if (isNaN(date.getTime())) return null;

  return date.toISOString().split('T')[0];
}

// Helper: Format to Thai date
function formatThaiDate(dateStr) {
  const date = new Date(dateStr);
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

// ===== Equipment Borrowing Functions =====

// เริ่ม flow ยืมอุปกรณ์
async function startEquipmentBorrowFlow(replyToken, userId, existingData = null) {
  const categories = await EquipmentCategory.getAll();

  if (categories.length === 0) {
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ ยังไม่มีหมวดหมู่อุปกรณ์ในระบบ' }]
    });
  }

  const catButtons = categories.slice(0, 10).map(c => ({
    type: 'button',
    style: 'primary',
    color: '#9b59b6',
    action: {
      type: 'postback',
      label: c.name,
      data: `action=select_eq_category&cat_id=${c.id}`
    }
  }));

  // เก็บ session ถ้ามี data เดิม
  if (existingData && existingData.items) {
    await UserSession.set(userId, 'eq_selecting', existingData);
  }

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'เลือกหมวดหมู่อุปกรณ์',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#9b59b6',
          contents: [{
            type: 'text',
            text: '🔧 ยืมอุปกรณ์',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            { type: 'text', text: 'เลือกหมวดหมู่อุปกรณ์:', size: 'sm', color: '#666666' },
            ...catButtons
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '🔙 กลับเมนูหลัก',
              data: 'action=menu'
            }
          }]
        }
      }
    }]
  });
}

// แสดงอุปกรณ์ในหมวดหมู่
async function showEquipmentInCategory(replyToken, userId, categoryId) {
  const allEquipment = await Equipment.getByCategory(categoryId);
  const equipment = allEquipment.filter(e => e.available_quantity > 0);

  if (equipment.length === 0) {
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ ไม่มีอุปกรณ์ว่างในหมวดหมู่นี้' }]
    });
  }

  const eqButtons = equipment.slice(0, 10).map(e => ({
    type: 'button',
    style: 'primary',
    color: '#27ae60',
    action: {
      type: 'postback',
      label: `${e.name} (ว่าง ${e.available_quantity})`,
      data: `action=select_equipment&eq_id=${e.id}`
    }
  }));

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'เลือกอุปกรณ์',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📦 เลือกอุปกรณ์',
            weight: 'bold',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: eqButtons
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '🔙 เลือกหมวดหมู่อื่น',
              data: 'action=borrow_equipment'
            }
          }]
        }
      }
    }]
  });
}

// เริ่มเลือกอุปกรณ์
async function startEquipmentSelection(replyToken, userId, equipmentId) {
  const eq = await Equipment.getById(equipmentId);
  if (!eq || eq.available_quantity <= 0) {
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ อุปกรณ์นี้ไม่ว่างแล้ว' }]
    });
  }

  const session = await UserSession.get(userId);
  const data = session?.data || {};
  data.current_eq_id = equipmentId;
  data.current_eq_name = eq.name;
  data.available = eq.available_quantity;

  await UserSession.set(userId, 'eq_awaiting_quantity', data);

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `🔧 ${eq.name}\nว่าง: ${eq.available_quantity} ${eq.unit}\n\n🔢 กรุณาระบุจำนวนที่ต้องการยืม`
    }]
  });
}

// แสดงสรุปการยืมอุปกรณ์
async function showEquipmentConfirmation(replyToken, userId, data) {
  await UserSession.set(userId, 'eq_awaiting_confirm', data);

  const itemsList = data.items.map(i => `• ${i.name} x${i.quantity}`).join('\n');

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'ยืนยันการยืมอุปกรณ์',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#9b59b6',
          contents: [{
            type: 'text',
            text: '📋 สรุปการยืมอุปกรณ์',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: `👤 ผู้ยืม: ${data.user_name}`,
            size: 'sm'
          }, {
            type: 'text',
            text: `📱 โทร: ${data.phone || '-'}`,
            size: 'sm'
          }, {
            type: 'text',
            text: `📅 วันยืม: ${formatThaiDate(data.borrow_date)}`,
            size: 'sm'
          }, {
            type: 'text',
            text: `📅 วันคืน: ${formatThaiDate(data.return_date)}`,
            size: 'sm'
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'text',
            text: '📦 รายการอุปกรณ์:',
            size: 'sm',
            weight: 'bold',
            margin: 'md'
          }, {
            type: 'text',
            text: itemsList,
            size: 'sm',
            wrap: true
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'text',
            text: 'พิมพ์ "ยืนยัน" เพื่อส่งคำขอ',
            size: 'sm',
            color: '#27ae60',
            margin: 'md'
          }, {
            type: 'text',
            text: 'หรือ "ยกเลิก" เพื่อยกเลิก',
            size: 'sm',
            color: '#e74c3c'
          }]
        }
      }
    }]
  });
}

// สร้างคำขอยืมอุปกรณ์
async function createEquipmentReservation(replyToken, userId, data) {
  try {
    const reservation = await EquipmentReservation.create({
      user_name: data.user_name,
      line_user_id: userId,
      phone: data.phone,
      borrow_date: data.borrow_date,
      return_date: data.return_date,
      items: data.items.map(i => ({ equipment_id: i.equipment_id, quantity: i.quantity }))
    });

    await UserSession.reset(userId);

    // แจ้ง Admin
    const { notifyAdminNewEquipmentRequest } = require('../utils/lineNotify');
    await notifyAdminNewEquipmentRequest({
      id: reservation.id,
      user_name: data.user_name,
      borrow_date: data.borrow_date,
      return_date: data.return_date
    });

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'ส่งคำขอยืมอุปกรณ์เรียบร้อย',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: '✅ ส่งคำขอยืมอุปกรณ์เรียบร้อย!',
              weight: 'bold',
              size: 'lg',
              color: '#27ae60'
            }, {
              type: 'text',
              text: `หมายเลขคำขอ: #EQ-${String(reservation.id).padStart(4, '0')}`,
              size: 'sm',
              color: '#666666',
              margin: 'md'
            }, {
              type: 'text',
              text: 'กรุณารอการอนุมัติจากเจ้าหน้าที่',
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'button',
              style: 'primary',
              color: '#27ae60',
              action: {
                type: 'postback',
                label: '🏠 กลับเมนูหลัก',
                data: 'action=menu'
              }
            }]
          }
        }
      }]
    });
  } catch (error) {
    console.error('Create equipment reservation error:', error);
    await UserSession.reset(userId);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' }]
    });
  }
}

// แสดงสถานะการยืมอุปกรณ์ของผู้ใช้
async function showUserEquipmentReservations(replyToken, userId) {
  const reservations = await EquipmentReservation.getByLineUserId(userId);

  if (!reservations || reservations.length === 0) {
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '📦 คุณยังไม่มีการยืมอุปกรณ์' }]
    });
  }

  const bubbles = [];
  for (const r of reservations.slice(0, 5)) {
    const statusText = {
      pending: '🟡 รออนุมัติ',
      approved: '🟢 อนุมัติแล้ว',
      rejected: '🔴 ไม่อนุมัติ',
      borrowed: '📦 กำลังยืม',
      returned: '✅ คืนแล้ว',
      cancelled: '⚪ ยกเลิก',
      overdue: '🔴 เลยกำหนด'
    }[r.status] || r.status;

    const items = await EquipmentReservation.getItems(r.id);
    const itemsText = items.slice(0, 3).map(i => `${i.equipment_name} x${i.quantity}`).join(', ');

    bubbles.push({
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'text',
          text: `#EQ-${String(r.id).padStart(4, '0')}`,
          weight: 'bold',
          size: 'lg'
        }, {
          type: 'text',
          text: statusText,
          size: 'sm'
        }, {
          type: 'separator',
          margin: 'md'
        }, {
          type: 'text',
          text: `📅 ${formatThaiDate(r.borrow_date)} - ${formatThaiDate(r.return_date)}`,
          size: 'xs',
          color: '#666666',
          margin: 'md'
        }, {
          type: 'text',
          text: `📦 ${itemsText}`,
          size: 'xs',
          color: '#666666',
          wrap: true
        }]
      }
    });
  }

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'สถานะการยืมอุปกรณ์',
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    }]
  });
}

// ===== Stock Functions =====

// แสดงสรุป Stock
async function showStockSummary(replyToken) {
  try {
    const categories = await StockCategory.getAll();
    const items = await StockItem.getAll();

    // สรุปตามหมวดหมู่
    const catSummary = categories.map(cat => {
      const catItems = items.filter(i => i.category_id === cat.id);
      const lowStock = catItems.filter(i => i.current_quantity <= i.min_quantity).length;
      return `📦 ${cat.name}: ${catItems.length} รายการ ${lowStock > 0 ? `(⚠️ ใกล้หมด ${lowStock})` : ''}`;
    }).join('\n');

    // รายการใกล้หมด
    const lowStockItems = items.filter(i => i.current_quantity <= i.min_quantity).slice(0, 5);
    let lowStockText = '';
    if (lowStockItems.length > 0) {
      lowStockText = '\n\n⚠️ วัสดุใกล้หมด:\n' + lowStockItems.map(i =>
        `• ${i.name}: ${i.current_quantity}/${i.min_quantity} ${i.unit}`
      ).join('\n');
    }

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'สรุป Stock วัสดุ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e67e22',
            contents: [{
              type: 'text',
              text: '📊 สรุป Stock วัสดุ',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: catSummary + lowStockText,
              wrap: true,
              size: 'sm'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [{
              type: 'button',
              style: 'primary',
              color: '#e67e22',
              action: {
                type: 'postback',
                label: '📝 ขอเบิกวัสดุ',
                data: 'action=request_stock'
              }
            }, {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: '🏠 กลับเมนูหลัก',
                data: 'action=menu'
              }
            }]
          }
        }
      }]
    });
  } catch (error) {
    console.error('showStockSummary error:', error);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการโหลดข้อมูล Stock' }]
    });
  }
}

// เริ่ม flow ขอเบิกวัสดุ
async function startStockRequestFlow(replyToken, userId, existingData = null) {
  try {
    const categories = await StockCategory.getAll();

    if (categories.length === 0) {
      return client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: '❌ ยังไม่มีหมวดหมู่วัสดุในระบบ' }]
      });
    }

    const catButtons = categories.slice(0, 10).map(c => ({
      type: 'button',
      style: 'primary',
      color: '#e67e22',
      action: {
        type: 'postback',
        label: c.name,
        data: `action=select_stock_category&cat_id=${c.id}`
      }
    }));

    // เก็บ session ถ้ามี data เดิม
    if (existingData && existingData.items) {
      await UserSession.set(userId, 'stock_selecting', existingData);
    }

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'เลือกหมวดหมู่วัสดุ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e67e22',
            contents: [{
              type: 'text',
              text: '📝 ขอเบิกวัสดุ',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'เลือกหมวดหมู่วัสดุ:', size: 'sm', color: '#666666' },
              ...catButtons
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: '🔙 กลับเมนูหลัก',
                data: 'action=menu'
              }
            }]
          }
        }
      }]
    });
  } catch (error) {
    console.error('startStockRequestFlow error:', error);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด' }]
    });
  }
}

// แสดงวัสดุในหมวดหมู่
async function showStockItemsInCategory(replyToken, userId, categoryId) {
  try {
    const items = await StockItem.getByCategory(categoryId);
    const availableItems = items.filter(i => i.current_quantity > 0);

    if (availableItems.length === 0) {
      return client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: '❌ ไม่มีวัสดุในหมวดหมู่นี้ หรือหมดแล้ว' }]
      });
    }

    const itemButtons = availableItems.slice(0, 10).map(i => ({
      type: 'button',
      style: 'primary',
      color: '#27ae60',
      action: {
        type: 'postback',
        label: `${i.name} (${i.current_quantity} ${i.unit})`,
        data: `action=select_stock_item&item_id=${i.id}`
      }
    }));

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'เลือกวัสดุ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: '📦 เลือกวัสดุ',
              weight: 'bold',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: itemButtons
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'button',
              style: 'secondary',
              action: {
                type: 'postback',
                label: '🔙 เลือกหมวดหมู่อื่น',
                data: 'action=request_stock'
              }
            }]
          }
        }
      }]
    });
  } catch (error) {
    console.error('showStockItemsInCategory error:', error);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด' }]
    });
  }
}

// เริ่มเลือกจำนวนวัสดุ
async function startStockItemSelection(replyToken, userId, itemId) {
  try {
    const item = await StockItem.getById(itemId);
    if (!item || item.current_quantity <= 0) {
      return client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: '❌ วัสดุนี้หมดแล้ว' }]
      });
    }

    const session = await UserSession.get(userId);
    const data = session?.data || {};
    data.current_item_id = itemId;
    data.current_item_name = item.name;
    data.available = item.current_quantity;
    data.unit = item.unit;

    await UserSession.set(userId, 'stock_awaiting_quantity', data);

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: `📦 ${item.name}\nคงเหลือ: ${item.current_quantity} ${item.unit}\n\n🔢 กรุณาระบุจำนวนที่ต้องการเบิก`
      }]
    });
  } catch (error) {
    console.error('startStockItemSelection error:', error);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด' }]
    });
  }
}

// แสดงสรุปการขอเบิกวัสดุ
async function showStockRequestConfirmation(replyToken, userId, data) {
  await UserSession.set(userId, 'stock_awaiting_confirm', data);

  const itemsList = data.items.map(i => `• ${i.name} x${i.quantity} ${i.unit}`).join('\n');

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'ยืนยันการขอเบิกวัสดุ',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#e67e22',
          contents: [{
            type: 'text',
            text: '📋 สรุปการขอเบิกวัสดุ',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: `👤 ผู้ขอ: ${data.user_name}`,
            size: 'sm'
          }, {
            type: 'text',
            text: `📱 โทร: ${data.phone || '-'}`,
            size: 'sm'
          }, {
            type: 'text',
            text: `📝 เหตุผล: ${data.purpose}`,
            size: 'sm',
            wrap: true
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'text',
            text: '📦 รายการวัสดุ:',
            size: 'sm',
            weight: 'bold',
            margin: 'md'
          }, {
            type: 'text',
            text: itemsList,
            size: 'sm',
            wrap: true
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'text',
            text: 'พิมพ์ "ยืนยัน" เพื่อส่งคำขอ',
            size: 'sm',
            color: '#27ae60',
            margin: 'md'
          }, {
            type: 'text',
            text: 'หรือ "ยกเลิก" เพื่อยกเลิก',
            size: 'sm',
            color: '#e74c3c'
          }]
        }
      }
    }]
  });
}

// สร้างคำขอเบิกวัสดุ
async function createStockRequest(replyToken, userId, data) {
  try {
    const request = await StockRequest.create({
      user_name: data.user_name,
      line_user_id: userId,
      phone: data.phone,
      purpose: data.purpose,
      items: data.items.map(i => ({ item_id: i.item_id, quantity: i.quantity }))
    });

    await UserSession.reset(userId);

    // แจ้ง Admin
    try {
      const { notifyAdminNewStockRequest } = require('../utils/lineNotify');
      if (notifyAdminNewStockRequest) {
        await notifyAdminNewStockRequest({
          id: request.id,
          user_name: data.user_name,
          items_summary: data.items.map(i => `${i.name} x${i.quantity}`).join(', ')
        });
      }
    } catch (e) {
      console.error('Notify error:', e);
    }

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'ส่งคำขอเบิกวัสดุเรียบร้อย',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: '✅ ส่งคำขอเบิกวัสดุเรียบร้อย!',
              weight: 'bold',
              size: 'lg',
              color: '#27ae60'
            }, {
              type: 'text',
              text: `หมายเลขคำขอ: #STK-${String(request.id).padStart(4, '0')}`,
              size: 'sm',
              color: '#666666',
              margin: 'md'
            }, {
              type: 'text',
              text: 'กรุณารอการอนุมัติจากเจ้าหน้าที่',
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'button',
              style: 'primary',
              color: '#27ae60',
              action: {
                type: 'postback',
                label: '🏠 กลับเมนูหลัก',
                data: 'action=menu'
              }
            }]
          }
        }
      }]
    });
  } catch (error) {
    console.error('createStockRequest error:', error);
    await UserSession.reset(userId);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' }]
    });
  }
}

// แสดงสถานะคำขอเบิกของผู้ใช้
async function showUserStockRequests(replyToken, userId) {
  try {
    const requests = await StockRequest.getByLineUserId(userId);

    if (!requests || requests.length === 0) {
      return client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: '📋 คุณยังไม่มีคำขอเบิกวัสดุ' }]
      });
    }

    const bubbles = requests.slice(0, 5).map(r => {
      const statusText = {
        pending: '🟡 รออนุมัติ',
        approved: '🟢 อนุมัติแล้ว',
        rejected: '🔴 ไม่อนุมัติ'
      }[r.status] || r.status;

      return {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'text',
            text: `#STK-${String(r.id).padStart(4, '0')}`,
            weight: 'bold',
            size: 'lg'
          }, {
            type: 'text',
            text: statusText,
            size: 'sm'
          }, {
            type: 'separator',
            margin: 'md'
          }, {
            type: 'text',
            text: `📦 ${r.items_summary || '-'}`,
            size: 'xs',
            color: '#666666',
            wrap: true,
            margin: 'md'
          }, {
            type: 'text',
            text: `📝 ${r.purpose || '-'}`,
            size: 'xs',
            color: '#666666',
            wrap: true
          }]
        }
      };
    });

    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'flex',
        altText: 'สถานะคำขอเบิกวัสดุ',
        contents: {
          type: 'carousel',
          contents: bubbles
        }
      }]
    });
  } catch (error) {
    console.error('showUserStockRequests error:', error);
    return client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: '❌ เกิดข้อผิดพลาดในการโหลดข้อมูล' }]
    });
  }
}

module.exports = router;
