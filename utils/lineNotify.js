const line = require('@line/bot-sdk');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// แจ้ง Admin เมื่อมีคำขอจองใหม่
async function notifyAdminNewRequest(reservation) {
  const adminLineUserId = process.env.ADMIN_LINE_USER_ID;
  if (!adminLineUserId) {
    console.log('ADMIN_LINE_USER_ID not configured');
    return;
  }

  try {
    await client.pushMessage({
      to: adminLineUserId,
      messages: [{
        type: 'flex',
        altText: 'คำขอจองบ่อใหม่',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f39c12',
            contents: [{
              type: 'text',
              text: '📋 คำขอจองใหม่!',
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
      }]
    });
    console.log('Admin notified of new request');
  } catch (error) {
    console.error('Error notifying admin:', error);
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
        altText: 'คำขอจองได้รับการอนุมัติ',
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
        altText: 'คำขอจองไม่ได้รับการอนุมัติ',
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

// แจ้งเตือนก่อนหมดอายุการจอง
async function sendExpiryReminder(reservation, daysRemaining) {
  if (!reservation.line_user_id) return;

  try {
    await client.pushMessage({
      to: reservation.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'แจ้งเตือนการจองใกล้หมดอายุ',
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
              text: `การจองจะสิ้นสุดใน ${daysRemaining} วัน`,
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

// แจ้งผู้ใช้เมื่อการจองถูกยกเลิก
async function sendCancellationNotification(reservation, reason) {
  if (!reservation.line_user_id) return;

  try {
    await client.pushMessage({
      to: reservation.line_user_id,
      messages: [{
        type: 'flex',
        altText: 'การจองถูกยกเลิก',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#95a5a6',
            contents: [{
              type: 'text',
              text: '🚫 การจองถูกยกเลิก',
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

// แจ้ง Admin เมื่อมีคำขอยกเลิกการจอง
async function notifyAdminCancellationRequest(request) {
  const adminLineUserId = process.env.ADMIN_LINE_USER_ID;
  if (!adminLineUserId) {
    console.log('ADMIN_LINE_USER_ID not configured');
    return;
  }

  try {
    await client.pushMessage({
      to: adminLineUserId,
      messages: [{
        type: 'flex',
        altText: 'คำขอยกเลิกการจอง',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e74c3c',
            contents: [{
              type: 'text',
              text: '🚫 คำขอยกเลิกการจอง',
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
      }]
    });
    console.log('Admin notified of cancellation request');
  } catch (error) {
    console.error('Error notifying admin of cancellation request:', error);
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
              text: '✅ ยกเลิกการจองสำเร็จ',
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
              text: 'การจองของคุณถูกยกเลิกเรียบร้อยแล้ว',
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

module.exports = {
  notifyAdminNewRequest,
  sendApprovalNotification,
  sendRejectionNotification,
  sendCancellationNotification,
  sendExpiryReminder,
  notifyAdminCancellationRequest,
  sendCancellationApprovalNotification,
  sendCancellationRejectionNotification
};
