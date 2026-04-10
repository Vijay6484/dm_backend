const { getTransporter } = require('./mailer');
const { buildBookingConfirmationHtml } = require('./booking_confirmation_pdf');
const { renderPdfBufferFromHtml } = require('./render_pdf');

async function sendBookingConfirmationEmail({ booking }) {
  const transporter = getTransporter();

  const html = await buildBookingConfirmationHtml(booking);
  const pdfBuffer = await renderPdfBufferFromHtml(html);

  const to = (booking.email || '').trim();
  if (!to) {
    throw new Error('Customer email is missing on booking.');
  }

  const paidNow = booking.advanceTotalAmount ?? 0;
  const remaining = booking.remainingAmount ?? 0;

  await transporter.sendMail({
    from: `"Dometriks" <${process.env.SMTP_USER || 'noreply@dometriks.com'}>`,
    to,
    subject: `Dometriks Booking Confirmation (QR) - Booking ${booking._id}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <p>Dear ${booking.name || 'Customer'},</p>
        <p>Your booking is confirmed. Please find attached your <strong>Booking Confirmation PDF</strong> with the verification QR code.</p>
        <p>
          <strong>Paid online (advance):</strong> ₹${Number(paidNow).toLocaleString('en-IN')}<br/>
          <strong>Remaining payable on arrival:</strong> ₹${Number(remaining).toLocaleString('en-IN')}
        </p>
        <p>Regards,<br/>Dometriks Team</p>
      </div>
    `,
    attachments: [
      {
        filename: `Booking_Confirmation_${booking._id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

module.exports = { sendBookingConfirmationEmail };

