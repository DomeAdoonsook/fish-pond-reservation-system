const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');
const Pond = require('../models/Pond');
const Reservation = require('../models/Reservation');
const UserSession = require('../models/UserSession');
const Log = require('../models/Log');

// LINE Config
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// Webhook endpoint
router.post('/', line.middleware(config), async (req, res) => {
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
  const session = UserSession.get(userId);
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

  if (lowerText.includes('จอง') || lowerText.includes('book')) {
    return startBookingFlow(event.replyToken, userId);
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
      UserSession.reset(userId);
      return showMainMenu(event.replyToken);

    default:
      return showMainMenu(event.replyToken);
  }
}

// Handle conversation flow
async function handleConversationFlow(event, userId, state, data, text) {
  switch (state) {
    case 'awaiting_name':
      data.user_name = text;
      UserSession.set(userId, 'awaiting_fish_type', data);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '🐟 กรุณาระบุชนิดปลาที่จะเลี้ยง\n\nตัวอย่าง: ปลานิล, ปลาดุก, ปลาทับทิม'
        }]
      });

    case 'awaiting_fish_type':
      data.fish_type = text;
      UserSession.set(userId, 'awaiting_quantity', data);
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
      UserSession.set(userId, 'awaiting_start_date', data);
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
      UserSession.set(userId, 'awaiting_duration', data);
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
        UserSession.reset(userId);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: '❌ ยกเลิกการจองแล้ว'
          }]
        });
      } else {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: 'กรุณาพิมพ์ "ยืนยัน" เพื่อยืนยันการจอง\nหรือ "ยกเลิก" เพื่อยกเลิก'
          }]
        });
      }

    default:
      UserSession.reset(userId);
      return showMainMenu(event.replyToken);
  }
}

// Show main menu
async function showMainMenu(replyToken) {
  const status = Pond.getStatusCount();

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'เมนูหลัก - ระบบจองบ่อเลี้ยงปลา',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '🐟 ระบบจองบ่อเลี้ยงปลา',
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
              label: '📋 จองบ่อ',
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
              label: '📊 สถานะการจองของฉัน',
              data: 'action=my_status'
            }
          }, {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: '❌ ยกเลิกการจอง',
              data: 'action=cancel_booking'
            }
          }]
        }
      }
    }]
  });
}

// Start booking flow - show zones
async function startBookingFlow(replyToken, userId) {
  const zones = Pond.getAvailableCountByZone();

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
  const ponds = Pond.getAvailableByZone(zone);

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

// Start pond booking
async function startPondBooking(replyToken, userId, pondId) {
  const pond = Pond.getById(pondId);

  if (!pond || pond.status !== 'available') {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '❌ บ่อนี้ไม่ว่างแล้ว กรุณาเลือกบ่ออื่น'
      }]
    });
  }

  // เริ่ม session การจอง
  UserSession.set(userId, 'awaiting_name', {
    pond_id: pondId,
    pond_code: pond.pond_code
  });

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `📝 เริ่มจองบ่อ ${pond.pond_code}\n\n👤 กรุณาระบุชื่อผู้จอง`
    }]
  });
}

// Show booking confirmation
async function showBookingConfirmation(replyToken, userId, data) {
  UserSession.set(userId, 'awaiting_confirm', data);

  const startDateThai = formatThaiDate(data.start_date);
  const endDateThai = formatThaiDate(data.end_date);

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'flex',
      altText: 'ยืนยันการจอง',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📋 สรุปการจอง',
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
              text: 'ผู้จอง:',
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
            text: 'พิมพ์ "ยืนยัน" เพื่อส่งคำขอจอง',
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
    const reservationId = Reservation.create({
      pond_id: data.pond_id,
      user_name: data.user_name,
      line_user_id: userId,
      fish_type: data.fish_type,
      fish_quantity: data.fish_quantity,
      start_date: data.start_date,
      end_date: data.end_date
    });

    Log.create('reservation_created', {
      pond_id: data.pond_id,
      reservation_id: reservationId,
      user_id: userId,
      details: data
    });

    UserSession.reset(userId);

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
        altText: 'ส่งคำขอจองเรียบร้อย',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: '✅ ส่งคำขอจองเรียบร้อย!',
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
    UserSession.reset(userId);
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
  const zones = Pond.getAvailableCountByZone();
  const status = Pond.getStatusCount();

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
              label: '📋 จองบ่อเลย',
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
  const reservations = Reservation.getByLineUserId(userId);

  if (reservations.length === 0) {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '📋 คุณยังไม่มีการจอง'
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
            label: '❌ ยกเลิกการจองนี้',
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
      altText: 'การจองของคุณ',
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    }]
  });
}

// Confirm cancel booking
async function confirmCancelBooking(replyToken, userId, reservationId) {
  const reservation = Reservation.getById(reservationId);

  if (!reservation || reservation.line_user_id !== userId) {
    return client.replyMessage({
      replyToken,
      messages: [{
        type: 'text',
        text: '❌ ไม่พบการจองนี้หรือคุณไม่มีสิทธิ์ยกเลิก'
      }]
    });
  }

  Reservation.cancel(reservationId);

  Log.create('reservation_cancelled', {
    pond_id: reservation.pond_id,
    reservation_id: reservationId,
    user_id: userId
  });

  return client.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `✅ ยกเลิกการจองบ่อ ${reservation.pond_code} เรียบร้อยแล้ว`
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

module.exports = router;
