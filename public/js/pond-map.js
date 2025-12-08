// Pond Grid Interactive Script

function showPondModal(pondId) {
  const pond = pondsData.find(p => p.id === pondId);
  if (!pond) return;

  const modal = new bootstrap.Modal(document.getElementById('pondModal'));
  const modalTitle = document.getElementById('modalPondCode');
  const modalBody = document.getElementById('modalPondBody');
  const modalViewDetail = document.getElementById('modalViewDetail');

  modalTitle.textContent = 'บ่อ ' + pond.pond_code;
  modalViewDetail.href = '/admin/pond/' + pond.id;

  let statusBadge = '';
  if (pond.status === 'maintenance') {
    statusBadge = '<span class="badge bg-secondary">ปิดปรับปรุง</span>';
  } else if (pond.user_name) {
    statusBadge = '<span class="badge bg-danger">ใช้งาน</span>';
  } else {
    statusBadge = '<span class="badge bg-success">ว่าง</span>';
  }

  let html = `
    <table class="table table-borderless mb-0">
      <tr>
        <td width="40%" class="text-muted">สถานะ:</td>
        <td>${statusBadge}</td>
      </tr>
      <tr>
        <td class="text-muted">โซน:</td>
        <td>${pond.zone}</td>
      </tr>
      <tr>
        <td class="text-muted">ขนาด:</td>
        <td>${pond.size === 'large' ? 'ใหญ่' : pond.size === 'medium' ? 'กลาง' : 'เล็ก'}</td>
      </tr>
    </table>
  `;

  if (pond.user_name) {
    html += `
      <hr>
      <h6><i class="bi bi-person me-2"></i>ข้อมูลการใช้งาน</h6>
      <table class="table table-sm table-borderless mb-0">
        <tr>
          <td width="40%" class="text-muted">ผู้ใช้:</td>
          <td class="fw-bold">${pond.user_name}</td>
        </tr>
        <tr>
          <td class="text-muted">ชนิดปลา:</td>
          <td>${pond.fish_type}</td>
        </tr>
        <tr>
          <td class="text-muted">จำนวน:</td>
          <td>${pond.fish_quantity?.toLocaleString() || '-'} ตัว</td>
        </tr>
        <tr>
          <td class="text-muted">วันลงปลา:</td>
          <td>${pond.start_date ? formatThaiDate(pond.start_date) : '-'}</td>
        </tr>
        <tr>
          <td class="text-muted">อายุปลา:</td>
          <td><span class="badge bg-info">${pond.fish_age_days || 0} วัน</span></td>
        </tr>
        <tr>
          <td class="text-muted">สิ้นสุด:</td>
          <td>${pond.end_date ? formatThaiDate(pond.end_date) : '-'}</td>
        </tr>
      </table>
    `;
  }

  modalBody.innerHTML = html;
  modal.show();
}

// Helper function
function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}
