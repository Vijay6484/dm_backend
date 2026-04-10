const QRCode = require('qrcode');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(n) {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

async function buildBookingConfirmationHtml(booking) {
  const qrDataUrl = await QRCode.toDataURL(String(booking.verificationCode || ''), {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
  });

  const paidNow = booking.advanceTotalAmount ?? 0;
  const remaining = booking.remainingAmount ?? 0;
  const total = booking.totalAmount ?? booking.amount ?? 0;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Booking Confirmation</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #0f172a; }
        .header { display:flex; justify-content: space-between; align-items: flex-start; }
        .brand { font-weight: 800; letter-spacing: 2px; color: #1e40af; font-size: 22px; }
        .sub { color:#64748b; margin-top: 4px; font-size: 11px; letter-spacing: 1px;}
        .card { margin-top: 18px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; }
        .title { font-size: 20px; font-weight: 800; margin: 0 0 6px; }
        .muted { color:#475569; font-size: 12px; margin:0; }
        .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-top: 14px; }
        .row { display:flex; gap: 10px; }
        .label { width: 140px; color:#64748b; font-size: 12px; }
        .value { font-size: 12px; font-weight: 700; color:#0f172a; }
        .paybox { display:flex; justify-content: space-between; gap: 18px; margin-top: 14px; padding-top: 14px; border-top: 1px dashed #e2e8f0; }
        .payitem { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
        .paylabel { font-size: 11px; color:#64748b; font-weight: 700; letter-spacing: .5px; }
        .payvalue { font-size: 16px; font-weight: 900; margin-top: 6px; color:#0f172a; }
        .qrwrap { margin-top: 18px; display:flex; gap: 18px; align-items: center; }
        .qr { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #fff; }
        .note { font-size: 12px; color:#475569; }
        .note strong { color:#0f172a; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">DOMETRIKS</div>
          <div class="sub">PROPERTY MEASUREMENT PLATFORM</div>
        </div>
        <div style="text-align:right">
          <div class="muted" style="font-weight:700; letter-spacing:1px;">BOOKING ID</div>
          <div style="font-weight:900; font-size:12px; margin-top:4px;">${escapeHtml(booking._id)}</div>
          <div class="muted" style="margin-top:10px; font-weight:700; letter-spacing:1px;">DATE</div>
          <div style="font-weight:800; font-size:12px; margin-top:4px;">${escapeHtml(
            new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          )}</div>
        </div>
      </div>

      <div class="card">
        <div class="title">Booking Confirmation</div>
        <p class="muted">Keep this PDF handy. The engineer will scan the QR to unlock the survey flow.</p>

        <div class="grid">
          <div class="row"><div class="label">Customer</div><div class="value">${escapeHtml(booking.name)}</div></div>
          <div class="row"><div class="label">Phone</div><div class="value">${escapeHtml(booking.phone)}</div></div>
          <div class="row"><div class="label">Email</div><div class="value">${escapeHtml(booking.email || 'N/A')}</div></div>
          <div class="row"><div class="label">Service</div><div class="value">${escapeHtml(booking.serviceType)}</div></div>
          <div class="row"><div class="label">Units</div><div class="value">${escapeHtml(booking.units ?? 1)}</div></div>
          <div class="row"><div class="label">Location</div><div class="value">${escapeHtml(booking.location)}</div></div>
          <div class="row"><div class="label">Schedule</div><div class="value">${escapeHtml(
            booking.scheduleNow ? 'ASAP' : `${booking.scheduleDate} ${booking.scheduleTime ? `at ${booking.scheduleTime}` : ''}`
          )}</div></div>
          <div class="row"><div class="label">Verification Code</div><div class="value">${escapeHtml(booking.verificationCode)}</div></div>
        </div>

        <div class="paybox">
          <div class="payitem">
            <div class="paylabel">PAID ONLINE (ADVANCE)</div>
            <div class="payvalue">${formatMoney(paidNow)}</div>
          </div>
          <div class="payitem">
            <div class="paylabel">REMAINING PAYABLE ON ARRIVAL</div>
            <div class="payvalue">${formatMoney(remaining)}</div>
          </div>
          <div class="payitem">
            <div class="paylabel">TOTAL SERVICE AMOUNT</div>
            <div class="payvalue">${formatMoney(total)}</div>
          </div>
        </div>

        <div class="qrwrap">
          <div class="qr">
            <div style="font-size:11px; color:#64748b; font-weight:800; letter-spacing:1px; margin-bottom:8px;">VERIFICATION QR</div>
            <img src="${qrDataUrl}" width="180" height="180" />
          </div>
          <div class="note">
            <p style="margin:0 0 10px;">
              <strong>IMPORTANT:</strong> Please show this QR code to the engineer after the site visit.
            </p>
            <p style="margin:0;">
              If you did not receive this email earlier, you can forward this PDF to the engineer/representative for scanning.
            </p>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

module.exports = { buildBookingConfirmationHtml };

