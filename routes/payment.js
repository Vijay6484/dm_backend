const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Booking = require('../models/Booking');
const { sendBookingConfirmationEmail } = require('../utils/send_booking_confirmation');

const GST_RATE = 18;
const PAYU_TEST_URL = 'https://test.payu.in/_payment';
const PAYU_PROD_URL = 'https://secure.payu.in/_payment';

function getPayuUrl() {
    const mode = (process.env.PAYU_MODE || '').toLowerCase();
    return mode === 'production' || mode === 'live' ? PAYU_PROD_URL : PAYU_TEST_URL;
}

function generatePayuHash(params, salt) {
    const udf1 = params.udf1 || '';
    const udf2 = params.udf2 || '';
    const udf3 = params.udf3 || '';
    const udf4 = params.udf4 || '';
    const udf5 = params.udf5 || '';
    const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
    return crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
}

function verifyPayuResponseHash(body, salt) {
    const hashString = `${salt}|${body.status}||||||${body.udf5 || ''}|${body.udf4 || ''}|${body.udf3 || ''}|${body.udf2 || ''}|${body.udf1 || ''}|${body.email}|${body.firstname}|${body.productinfo}|${body.amount}|${body.txnid}|${body.key}`;
    const expectedHash = crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
    const got = String(body.hash || body.hashes?.sha512 || '').toLowerCase();
    return expectedHash === got;
}

/** Only fields PayU expects in the POST body (never pass internal keys like payuUrl). */
function pickPayuPostBodyFields(obj) {
    const allow = new Set([
        'key', 'txnid', 'amount', 'productinfo', 'firstname', 'email', 'phone',
        'surl', 'furl', 'udf1', 'udf2', 'udf3', 'udf4', 'udf5',
        'hash', 'service_provider',
    ]);
    const out = {};
    for (const k of allow) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined && obj[k] !== null) {
            out[k] = obj[k];
        }
    }
    return out;
}

function payuAutoPostHtml({ payuUrl, fields, title }) {
    const safe = pickPayuPostBodyFields(fields);
    const inputs = Object.entries(safe)
        .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}" />`)
        .join('\n');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${title || 'Redirecting to PayU...'}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
      .box { max-width: 520px; margin: 50px auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; }
      .muted { color:#64748b; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2 style="margin:0 0 8px;">Redirecting to PayU</h2>
      <p class="muted" style="margin:0;">Please wait…</p>
      <form id="payuForm" method="POST" action="${payuUrl}">
        ${inputs}
      </form>
    </div>
    <script>(function(){var f=document.getElementById("payuForm");if(!f||f.getAttribute("data-once")==="1")return;f.setAttribute("data-once","1");f.submit();})();</script>
  </body>
</html>`;
}

/**
 * Builds advance (booking) PayU POST fields + payuUrl. Hash uses the same fields PayU hashes (no service_provider).
 */
async function buildAdvancePayuCheckout(bookingId) {
    const key = process.env.PAYU_MERCHANT_KEY;
    const salt = process.env.PAYU_SALT;

    if (!key || !salt) {
        const err = new Error('PayU credentials not configured.');
        err.statusCode = 500;
        throw err;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
        const err = new Error('Booking not found.');
        err.statusCode = 404;
        throw err;
    }
    if (booking.paymentStatus === 'Paid') {
        const err = new Error('Booking already paid.');
        err.statusCode = 400;
        throw err;
    }

    const amountToCharge =
        booking.advanceTotalAmount ??
        (() => {
            const gstRate = booking.gstRate ?? GST_RATE;
            const advanceAmount = 200;
            const advanceGstAmount = Math.round(advanceAmount * (gstRate / 100) * 100) / 100;
            return Math.round((advanceAmount + advanceGstAmount) * 100) / 100;
        })();
    const amountStr = Number(amountToCharge).toFixed(2);
    const txnid = `TXN${bookingId.toString().slice(-8)}${Date.now().toString(36).toUpperCase()}`;

    const firstname = (booking.name || '').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)[0] || 'Customer';
    const productinfo = `Property Measurement - ${booking.serviceType}`;

    const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5555}`;
    const surl = `${apiBase}/api/payment/success`;
    const furl = `${apiBase}/api/payment/failure`;

    const params = {
        key,
        txnid,
        amount: amountStr,
        productinfo,
        firstname,
        email: booking.email,
        phone: (booking.phone || '').replace(/\D/g, '').slice(0, 10) || '9999999999',
        surl,
        furl,
        udf1: bookingId.toString(),
    };

    params.hash = generatePayuHash(params, salt);
    params.service_provider = 'payu_paisa';

    return { postFields: params, payuUrl: getPayuUrl() };
}

// POST /api/payment/init — generate PayU params for a booking (website posts form to PayU)
router.post('/init', async (req, res) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'bookingId is required.' });
        }
        const { postFields, payuUrl } = await buildAdvancePayuCheckout(bookingId);
        res.json({ success: true, data: { ...postFields, payuUrl } });
    } catch (err) {
        console.error('Payment init error:', err);
        const code = err.statusCode || 500;
        res.status(code).json({ success: false, message: err.message || 'Payment init failed.' });
    }
});

// GET /api/payment/remaining/pay?bookingId=XXX — engineer collects remaining payment (incl GST)
router.get('/remaining/pay', async (req, res) => {
    try {
        const bookingId = (req.query.bookingId || '').toString().trim();
        const key = process.env.PAYU_MERCHANT_KEY;
        const salt = process.env.PAYU_SALT;

        if (!key || !salt) {
            return res.status(500).send('PayU credentials not configured.');
        }
        if (!bookingId) {
            return res.status(400).send('bookingId is required.');
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).send('Booking not found.');
        if (booking.paymentStatus !== 'Paid') {
            return res.status(400).send('Advance payment is not completed for this booking.');
        }
        if (booking.remainingPaymentStatus === 'Paid' || Number(booking.remainingAmount || 0) <= 0) {
            return res.status(200).send('<html><body><h3>Remaining payment already completed.</h3></body></html>');
        }

        const amountStr = Number(booking.remainingAmount || 0).toFixed(2);
        const txnid = `RMN${bookingId.toString().slice(-8)}${Date.now().toString(36).toUpperCase()}`;
        const firstname = (booking.name || '').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)[0] || 'Customer';
        const productinfo = `Remaining Payment - ${booking.serviceType}`;

        const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5555}`;
        const surl = `${apiBase}/api/payment/remaining/success`;
        const furl = `${apiBase}/api/payment/remaining/failure`;

        const params = {
            key,
            txnid,
            amount: amountStr,
            productinfo,
            firstname,
            email: booking.email,
            phone: (booking.phone || '').replace(/\D/g, '').slice(0, 10) || '9999999999',
            surl,
            furl,
            udf1: bookingId.toString(),
        };
        params.hash = generatePayuHash(params, salt);
        params.service_provider = 'payu_paisa';

        const html = payuAutoPostHtml({
            payuUrl: getPayuUrl(),
            title: 'Pay Remaining Amount',
            fields: params,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
    } catch (err) {
        console.error('Remaining pay page error:', err);
        res.status(500).send('Something went wrong.');
    }
});

// POST /api/payment/remaining/success — PayU redirects here after successful remaining payment
router.post('/remaining/success', async (req, res) => {
    const salt = process.env.PAYU_SALT;
    if (!salt) {
        return res.status(500).send('Config error.');
    }

    const body = { ...req.body };
    if (!verifyPayuResponseHash(body, salt)) {
        console.error('PayU remaining success hash verification failed');
        return res.status(400).send('Hash verification failed.');
    }

    const bookingId = body.udf1;
    if (!bookingId) {
        return res.status(400).send('Missing booking.');
    }

    try {
        await Booking.findByIdAndUpdate(bookingId, {
            remainingPaymentStatus: 'Paid',
            remainingPayuTxnId: body.mihpayid || body.txnid,
            remainingPaidAt: new Date(),
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(`<!doctype html>
<html><body style="font-family:Arial;padding:24px;">
  <h2>Payment successful</h2>
  <p>You can now return to the Dometriks Engineer App and open the Design canvas.</p>
</body></html>`);
    } catch (err) {
        console.error('Remaining payment success update error:', err);
        res.status(500).send('Update failed.');
    }
});

// POST /api/payment/remaining/failure — PayU redirects here after failed remaining payment
router.post('/remaining/failure', async (req, res) => {
    const bookingId = req.body.udf1 || '';
    try {
        if (bookingId) {
            await Booking.findByIdAndUpdate(bookingId, { remainingPaymentStatus: 'Failed' });
        }
    } catch (err) {
        console.error('Remaining payment failure update error:', err);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html>
<html><body style="font-family:Arial;padding:24px;">
  <h2>Payment failed / cancelled</h2>
  <p>Please return to the app and try again.</p>
</body></html>`);
});

// POST /api/payment/success — PayU redirects here after successful payment
router.post('/success', async (req, res) => {
    const salt = process.env.PAYU_SALT;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

    if (!salt) {
        return res.redirect(`${frontendUrl}/payment-failure?error=config`);
    }

    const body = { ...req.body };
    if (!verifyPayuResponseHash(body, salt)) {
        console.error('PayU success hash verification failed');
        return res.redirect(`${frontendUrl}/payment-failure?error=hash&bookingId=${body.udf1 || ''}`);
    }

    const bookingId = body.udf1;
    if (!bookingId) {
        return res.redirect(`${frontendUrl}/payment-failure?error=no_booking`);
    }

    try {
        const booking = await Booking.findByIdAndUpdate(bookingId, {
            paymentStatus: 'Paid',
            payuTxnId: body.mihpayid || body.txnid,
            status: 'Confirmed',
        }, { new: true });

        // Fire-and-forget booking confirmation email with QR PDF.
        // We don't block the redirect if email fails.
        if (booking) {
            sendBookingConfirmationEmail({ booking }).catch((err) => {
                console.error('Booking confirmation email failed:', err?.message || err);
            });
        }
        res.redirect(`${frontendUrl}/payment-success?bookingId=${bookingId}`);
    } catch (err) {
        console.error('Payment success update error:', err);
        res.redirect(`${frontendUrl}/payment-failure?bookingId=${bookingId}&error=update`);
    }
});

// POST /api/payment/failure — PayU redirects here after failed payment
router.post('/failure', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const bookingId = req.body.udf1 || '';

    try {
        if (bookingId) {
            await Booking.findByIdAndUpdate(bookingId, { paymentStatus: 'Failed' });
        }
    } catch (err) {
        console.error('Payment failure update error:', err);
    }

    res.redirect(`${frontendUrl}/payment-failure?bookingId=${bookingId}`);
});

module.exports = router;
