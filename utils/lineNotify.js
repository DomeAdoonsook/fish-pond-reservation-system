const line = require('@line/bot-sdk');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// Helper: ดึง Admin LINE User IDs ทั้งหมด
function getAdminUserIds() {
  const adminIds = [];

  // รองรับ ADMIN_LINE_USER_ID, ADMIN_LINE_USER_ID_2, ADMIN_LINE_USER_ID_3, ...
  if (process.env.ADMIN_LINE_USER_ID) {
    adminIds.push(process.env.ADMIN_LINE_USER_ID);
  }
  if (process.env.ADMIN_LINE_USER_ID_2) {
    adminIds.push(process.env.ADMIN_LINE_USER_ID_2);
  }
  if (process.env.ADMIN_LINE_USER_ID_3) {
    adminIds.push(process.env.ADMIN_LINE_USER_ID_3);
  }
  if (process.env.ADMIN_LINE_USER_ID_4) {
    adminIds.push(process.env.ADMIN_LINE_USER_ID_4);
  }
  if (process.env.ADMIN_LINE_USER_ID_5) {
    adminIds.push(process.env.ADMIN_LINE_USER_ID_5);
  }

  return adminIds;
}

// Helper: ส่งข้อความไปหา Admin ทุกคน
async function pushMessageToAllAdmins(messages) {
  const adminIds = getAdminUserIds();

  if (adminIds.length === 0) {
    console.log('No ADMIN_LINE_USER_ID configured');
    return;
  }

  const results = await Promise.allSettled(
    adminIds.map(adminId =>
      client.pushMessage({ to: adminId, messages })
    )
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to notify admin ${index + 1}:`, result.reason);
    }
  });

  console.log(`Notified ${results.filter(r => r.status === 'fulfilled').length}/${adminIds.length} admins`);
}

// แจ้ง Admin เมื่อมีคำขอใช้บ่อใหม่
async function notifyAdminNewRequest(reservation) {
  try {
    await pushMessageToAllAdmins([{
      type: 'flex',
      altText: 'คำขอใช้บ่อใหม่',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#f39c12',
          contents: [{
            type: 'text',
            text: '📋 คำขอใช้บ่อใหม่!',
            weight: 'bold',
            color: '#ffffff',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: `#REQ-${String(reservation.id).padStart(4, '0')}`,
            weight: 'bold',
            size: 'lg'
          }, {
            type: 'separator'
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'บ่อ:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: reservation.pond_code,
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
              text: reservation.user_name,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'ปลา:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: `${reservation.fish_type} ${reservation.fish_quantity.toLocaleString()} ตัว`,
              weight: 'bold',
              flex: 3,
              wrap: true
            }]
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
              type: 'uri',
              label: 'ไปหน้าอนุมัติ',
              uri: `${process.env.BASE_URL || 'http://localhost:3000'}/admin/requests`
            }
          }]
        }
      }
    }]);
    console.log('Admins notified of new request');
  } catch (error) {
    console.error('Error notifying admins:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอได้รับการอนุมัติ
async function sendApprovalNotification(reservation) {
  if (!reservation.line_user_id) return;

  try {
    const startDate = formatThaiDate(reservation.start_date);
    const endDate = formatThaiDate(reservation.end_date);

    await client.pushMessage({
      to: reservation.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'คำขอใช้บ่อได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#27ae60',
            contents: [{
              type: 'text',
              text: '✅ อนุมัติแล้ว!',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `บ่อ ${reservation.pond_code}`,
              weight: 'bold',
              size: 'xl'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: `🐟 ${reservation.fish_type}`,
              size: 'md',
              margin: 'md'
            }, {
              type: 'text',
              text: `📦 จำนวน: ${reservation.fish_quantity.toLocaleString()} ตัว`,
              size: 'sm',
              color: '#666666'
            }, {
              type: 'text',
              text: `📅 เริ่ม: ${startDate}`,
              size: 'sm',
              color: '#666666'
            }, {
              type: 'text',
              text: `📅 สิ้นสุด: ${endDate}`,
              size: 'sm',
              color: '#666666'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: '🎉 ยินดีด้วย! สามารถเริ่มใช้งานบ่อได้เลย',
              size: 'sm',
              color: '#27ae60',
              align: 'center',
              wrap: true
            }]
          }
        }
      }]
    });
    console.log('User notified of approval');
  } catch (error) {
    console.error('Error sending approval notification:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอไม่ได้รับการอนุมัติ
async function sendRejectionNotification(reservation, reason) {
  if (!reservation.line_user_id) return;

  try {
    await client.pushMessage({
      to: reservation.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'คำขอใช้บ่อไม่ได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e74c3c',
            contents: [{
              type: 'text',
              text: '❌ ไม่อนุมัติ',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `บ่อ ${reservation.pond_code}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: reason ? `เหตุผล: ${reason}` : 'ไม่ระบุเหตุผล',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'สามารถส่งคำขอใหม่ได้',
              size: 'sm',
              color: '#666666',
              align: 'center'
            }]
          }
        }
      }]
    });
    console.log('User notified of rejection');
  } catch (error) {
    console.error('Error sending rejection notification:', error);
  }
}

// แจ้งเตือนก่อนหมดอายุการใช้บ่อ
async function sendExpiryReminder(reservation, daysRemaining) {
  if (!reservation.line_user_id) return;

  try {
    await client.pushMessage({
      to: reservation.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'แจ้งเตือนการใช้บ่อใกล้หมดอายุ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f39c12',
            contents: [{
              type: 'text',
              text: '⏰ แจ้งเตือน',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `บ่อ ${reservation.pond_code}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'text',
              text: `การใช้บ่อจะสิ้นสุดใน ${daysRemaining} วัน`,
              size: 'md',
              color: '#e74c3c',
              wrap: true
            }, {
              type: 'text',
              text: `วันสิ้นสุด: ${formatThaiDate(reservation.end_date)}`,
              size: 'sm',
              color: '#666666'
            }]
          }
        }
      }]
    });
    console.log('Expiry reminder sent');
  } catch (error) {
    console.error('Error sending expiry reminder:', error);
  }
}

// แจ้งผู้ใช้เมื่อการใช้บ่อถูกยกเลิก
async function sendCancellationNotification(reservation, reason) {
  if (!reservation.line_user_id) return;

  try {
    await client.pushMessage({
      to: reservation.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'การใช้บ่อถูกยกเลิก',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#95a5a6',
            contents: [{
              type: 'text',
              text: '🚫 การใช้บ่อถูกยกเลิก',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `บ่อ ${reservation.pond_code}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: `🐟 ${reservation.fish_type}`,
              size: 'md',
              margin: 'md'
            }, {
              type: 'text',
              text: reason ? `เหตุผล: ${reason}` : 'ไม่ระบุเหตุผล',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'หากมีข้อสงสัย กรุณาติดต่อเจ้าหน้าที่',
              size: 'sm',
              color: '#666666',
              align: 'center',
              wrap: true
            }]
          }
        }
      }]
    });
    console.log('User notified of cancellation');
  } catch (error) {
    console.error('Error sending cancellation notification:', error);
  }
}

// แจ้ง Admin เมื่อมีคำขอยกเลิกการใช้บ่อ
async function notifyAdminCancellationRequest(request) {
  try {
    await pushMessageToAllAdmins([{
      type: 'flex',
      altText: 'คำขอยกเลิกการใช้บ่อ',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#e74c3c',
          contents: [{
            type: 'text',
            text: '🚫 คำขอยกเลิกการใช้บ่อ',
            weight: 'bold',
            color: '#ffffff',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: `#CANCEL-${String(request.id).padStart(4, '0')}`,
            weight: 'bold',
            size: 'lg'
          }, {
            type: 'separator'
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'บ่อ:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: request.pond_code,
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
              text: request.user_name,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'เหตุผล:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: request.reason || 'ไม่ระบุ',
              weight: 'bold',
              flex: 3,
              wrap: true
            }]
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#e74c3c',
            action: {
              type: 'uri',
              label: 'ไปหน้าอนุมัติยกเลิก',
              uri: `${process.env.BASE_URL || 'http://localhost:3000'}/admin/cancel-requests`
            }
          }]
        }
      }
    }]);
    console.log('Admins notified of cancellation request');
  } catch (error) {
    console.error('Error notifying admins of cancellation request:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอยกเลิกได้รับการอนุมัติ
async function sendCancellationApprovalNotification(request) {
  if (!request.line_user_id) return;

  try {
    await client.pushMessage({
      to: request.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'คำขอยกเลิกได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#27ae60',
            contents: [{
              type: 'text',
              text: '✅ ยกเลิกการใช้บ่อสำเร็จ',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `บ่อ ${request.pond_code}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: 'การใช้บ่อของคุณถูกยกเลิกเรียบร้อยแล้ว',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }]
          }
        }
      }]
    });
    console.log('User notified of cancellation approval');
  } catch (error) {
    console.error('Error sending cancellation approval notification:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอยกเลิกถูกปฏิเสธ
async function sendCancellationRejectionNotification(request, reason) {
  if (!request.line_user_id) return;

  try {
    await client.pushMessage({
      to: request.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'คำขอยกเลิกไม่ได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e74c3c',
            contents: [{
              type: 'text',
              text: '❌ ไม่อนุมัติการยกเลิก',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `บ่อ ${request.pond_code}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: reason ? `เหตุผล: ${reason}` : 'ไม่ระบุเหตุผล',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'หากมีข้อสงสัย กรุณาติดต่อเจ้าหน้าที่',
              size: 'sm',
              color: '#666666',
              align: 'center',
              wrap: true
            }]
          }
        }
      }]
    });
    console.log('User notified of cancellation rejection');
  } catch (error) {
    console.error('Error sending cancellation rejection notification:', error);
  }
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

// ===== Equipment Notifications =====

// แจ้ง Admin เมื่อมีคำขอยืมอุปกรณ์ใหม่
async function notifyAdminNewEquipmentRequest(reservation) {
  try {
    await pushMessageToAllAdmins([{
      type: 'flex',
      altText: 'คำขอยืมอุปกรณ์ใหม่',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#9b59b6',
          contents: [{
            type: 'text',
            text: '🔧 คำขอยืมอุปกรณ์ใหม่!',
            weight: 'bold',
            color: '#ffffff',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: `#EQ-${String(reservation.id).padStart(4, '0')}`,
            weight: 'bold',
            size: 'lg'
          }, {
            type: 'separator'
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
              text: reservation.user_name,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'วันที่ยืม:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: formatThaiDate(reservation.borrow_date),
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'กำหนดคืน:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: formatThaiDate(reservation.return_date),
              flex: 3
            }]
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#9b59b6',
            action: {
              type: 'uri',
              label: 'ไปหน้าอนุมัติ',
              uri: `${process.env.BASE_URL || 'http://localhost:3000'}/admin/equipment/requests`
            }
          }]
        }
      }
    }]);
    console.log('Admins notified of new equipment request');
  } catch (error) {
    console.error('Error notifying admins of equipment request:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอยืมอุปกรณ์ได้รับการอนุมัติ
async function sendEquipmentApprovalNotification(lineUserId, reservation) {
  if (!lineUserId) return;

  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [{
        type: 'flex',
        altText: 'คำขอยืมอุปกรณ์ได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#27ae60',
            contents: [{
              type: 'text',
              text: '✅ อนุมัติแล้ว!',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `#EQ-${String(reservation.id).padStart(4, '0')}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: '🔧 คำขอยืมอุปกรณ์ได้รับการอนุมัติ',
              size: 'md',
              margin: 'md'
            }, {
              type: 'text',
              text: `📅 วันที่ยืม: ${formatThaiDate(reservation.borrow_date)}`,
              size: 'sm',
              color: '#666666'
            }, {
              type: 'text',
              text: `📅 กำหนดคืน: ${formatThaiDate(reservation.return_date)}`,
              size: 'sm',
              color: '#666666'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'กรุณามารับอุปกรณ์ตามวันที่กำหนด',
              size: 'sm',
              color: '#27ae60',
              align: 'center',
              wrap: true
            }]
          }
        }
      }]
    });
    console.log('User notified of equipment approval');
  } catch (error) {
    console.error('Error sending equipment approval notification:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอยืมอุปกรณ์ไม่ได้รับการอนุมัติ
async function sendEquipmentRejectionNotification(lineUserId, reservation, reason) {
  if (!lineUserId) return;

  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [{
        type: 'flex',
        altText: 'คำขอยืมอุปกรณ์ไม่ได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e74c3c',
            contents: [{
              type: 'text',
              text: '❌ ไม่อนุมัติ',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `#EQ-${String(reservation.id).padStart(4, '0')}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: '🔧 คำขอยืมอุปกรณ์ไม่ได้รับการอนุมัติ',
              size: 'md',
              margin: 'md',
              wrap: true
            }, {
              type: 'text',
              text: reason ? `เหตุผล: ${reason}` : 'ไม่ระบุเหตุผล',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'สามารถส่งคำขอใหม่ได้',
              size: 'sm',
              color: '#666666',
              align: 'center'
            }]
          }
        }
      }]
    });
    console.log('User notified of equipment rejection');
  } catch (error) {
    console.error('Error sending equipment rejection notification:', error);
  }
}

// แจ้งเตือนใกล้ถึงวันคืนอุปกรณ์
async function sendEquipmentReturnReminder(lineUserId, reservation, daysRemaining) {
  if (!lineUserId) return;

  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [{
        type: 'flex',
        altText: 'แจ้งเตือนใกล้ถึงกำหนดคืนอุปกรณ์',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f39c12',
            contents: [{
              type: 'text',
              text: '⏰ แจ้งเตือน',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `#EQ-${String(reservation.id).padStart(4, '0')}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'text',
              text: `ใกล้ถึงกำหนดคืนอุปกรณ์ใน ${daysRemaining} วัน`,
              size: 'md',
              color: '#e74c3c',
              wrap: true
            }, {
              type: 'text',
              text: `วันกำหนดคืน: ${formatThaiDate(reservation.return_date)}`,
              size: 'sm',
              color: '#666666'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'กรุณาคืนอุปกรณ์ตามกำหนด',
              size: 'sm',
              color: '#666666',
              align: 'center'
            }]
          }
        }
      }]
    });
    console.log('Equipment return reminder sent');
  } catch (error) {
    console.error('Error sending equipment return reminder:', error);
  }
}

// ดึงข้อมูล LINE Message Quota
async function getLineQuota() {
  try {
    // ดึง quota limit
    const quotaResponse = await fetch('https://api.line.me/v2/bot/message/quota', {
      headers: {
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    const quotaData = await quotaResponse.json();

    // ดึง consumption (จำนวนที่ใช้ไปแล้ว)
    const consumptionResponse = await fetch('https://api.line.me/v2/bot/message/quota/consumption', {
      headers: {
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    const consumptionData = await consumptionResponse.json();

    // คำนวณวันรีเซ็ต (วันที่ 1 ของเดือนหน้า)
    const now = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return {
      limit: quotaData.value || 500, // Free plan = 500
      used: consumptionData.totalUsage || 0,
      remaining: (quotaData.value || 500) - (consumptionData.totalUsage || 0),
      resetDate: resetDate.toISOString().split('T')[0],
      type: quotaData.type || 'none' // limited, none
    };
  } catch (error) {
    console.error('Error fetching LINE quota:', error);
    return {
      limit: 500,
      used: 0,
      remaining: 500,
      resetDate: null,
      error: error.message
    };
  }
}

// ===== Stock Notifications =====

// แจ้ง Admin เมื่อมีคำขอเบิกวัสดุใหม่
async function notifyAdminNewStockRequest(request) {
  try {
    const itemsList = request.items && request.items.length > 0
      ? request.items.map(i => `${i.item_name} x${i.requested_quantity}`).join(', ')
      : 'ไม่ระบุ';

    await pushMessageToAllAdmins([{
      type: 'flex',
      altText: 'คำขอเบิกวัสดุใหม่',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#16a085',
          contents: [{
            type: 'text',
            text: '📦 คำขอเบิกวัสดุใหม่!',
            weight: 'bold',
            color: '#ffffff',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: `#STK-${String(request.id).padStart(4, '0')}`,
            weight: 'bold',
            size: 'lg'
          }, {
            type: 'separator'
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
              text: request.user_name,
              weight: 'bold',
              flex: 3
            }]
          }, {
            type: 'box',
            layout: 'horizontal',
            contents: [{
              type: 'text',
              text: 'เหตุผล:',
              color: '#666666',
              flex: 2
            }, {
              type: 'text',
              text: request.purpose || 'ไม่ระบุ',
              flex: 3,
              wrap: true
            }]
          }, {
            type: 'text',
            text: `รายการ: ${itemsList}`,
            size: 'sm',
            color: '#666666',
            wrap: true,
            margin: 'md'
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#16a085',
            action: {
              type: 'uri',
              label: 'ไปหน้าอนุมัติ',
              uri: `${process.env.BASE_URL || 'http://localhost:3000'}/admin/stock/requests`
            }
          }]
        }
      }
    }]);
    console.log('Admins notified of new stock request');
  } catch (error) {
    console.error('Error notifying admins of stock request:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอเบิกวัสดุได้รับการอนุมัติ
async function notifyStockRequestApproved(request) {
  if (!request.line_user_id) return;

  try {
    await client.pushMessage({
      to: request.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'คำขอเบิกวัสดุได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#27ae60',
            contents: [{
              type: 'text',
              text: '✅ อนุมัติแล้ว!',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `#STK-${String(request.id).padStart(4, '0')}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: '📦 คำขอเบิกวัสดุได้รับการอนุมัติ',
              size: 'md',
              margin: 'md'
            }, {
              type: 'text',
              text: 'กรุณามารับวัสดุที่ห้องพัสดุ',
              size: 'sm',
              color: '#666666'
            }]
          }
        }
      }]
    });
    console.log('User notified of stock request approval');
  } catch (error) {
    console.error('Error sending stock approval notification:', error);
  }
}

// แจ้งผู้ใช้เมื่อคำขอเบิกวัสดุไม่ได้รับการอนุมัติ
async function notifyStockRequestRejected(request) {
  if (!request.line_user_id) return;

  try {
    await client.pushMessage({
      to: request.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'คำขอเบิกวัสดุไม่ได้รับการอนุมัติ',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e74c3c',
            contents: [{
              type: 'text',
              text: '❌ ไม่อนุมัติ',
              weight: 'bold',
              color: '#ffffff',
              size: 'lg'
            }]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [{
              type: 'text',
              text: `#STK-${String(request.id).padStart(4, '0')}`,
              weight: 'bold',
              size: 'lg'
            }, {
              type: 'separator'
            }, {
              type: 'text',
              text: '📦 คำขอเบิกวัสดุไม่ได้รับการอนุมัติ',
              size: 'md',
              margin: 'md',
              wrap: true
            }, {
              type: 'text',
              text: request.reject_reason ? `เหตุผล: ${request.reject_reason}` : 'ไม่ระบุเหตุผล',
              size: 'sm',
              color: '#666666',
              wrap: true,
              margin: 'md'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: 'สามารถส่งคำขอใหม่ได้',
              size: 'sm',
              color: '#666666',
              align: 'center'
            }]
          }
        }
      }]
    });
    console.log('User notified of stock request rejection');
  } catch (error) {
    console.error('Error sending stock rejection notification:', error);
  }
}

// แจ้ง Admin เมื่อ Stock ใกล้หมด
async function notifyLowStock(lowStockItems) {
  if (!lowStockItems || lowStockItems.length === 0) return;

  try {
    const itemsList = lowStockItems.map(i => `• ${i.name}: เหลือ ${i.current_quantity} ${i.unit} (ต่ำกว่า ${i.min_quantity})`).join('\n');

    await pushMessageToAllAdmins([{
      type: 'flex',
      altText: 'แจ้งเตือน: วัสดุใกล้หมด',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#e74c3c',
          contents: [{
            type: 'text',
            text: '⚠️ วัสดุใกล้หมด!',
            weight: 'bold',
            color: '#ffffff',
            size: 'lg'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [{
            type: 'text',
            text: 'รายการวัสดุที่ต้องสั่งซื้อเพิ่ม:',
            weight: 'bold',
            size: 'sm'
          }, {
            type: 'separator'
          }, {
            type: 'text',
            text: itemsList,
            size: 'sm',
            color: '#666666',
            wrap: true,
            margin: 'md'
          }]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{
            type: 'button',
            style: 'primary',
            color: '#e74c3c',
            action: {
              type: 'uri',
              label: 'ไปหน้า Stock',
              uri: `${process.env.BASE_URL || 'http://localhost:3000'}/admin/stock`
            }
          }]
        }
      }
    }]);
    console.log('Admins notified of low stock items');
  } catch (error) {
    console.error('Error notifying admins of low stock:', error);
  }
}

module.exports = {
  notifyAdminNewRequest,
  sendApprovalNotification,
  sendRejectionNotification,
  sendCancellationNotification,
  sendExpiryReminder,
  notifyAdminCancellationRequest,
  sendCancellationApprovalNotification,
  sendCancellationRejectionNotification,
  // Equipment notifications
  notifyAdminNewEquipmentRequest,
  sendEquipmentApprovalNotification,
  sendEquipmentRejectionNotification,
  sendEquipmentReturnReminder,
  // Stock notifications
  notifyAdminNewStockRequest,
  notifyStockRequestApproved,
  notifyStockRequestRejected,
  notifyLowStock,
  // Quota
  getLineQuota
};
