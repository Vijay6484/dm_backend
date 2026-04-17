const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Booking = require('../models/Booking');
const { sendBookingConfirmationEmail } = require('../utils/send_booking_confirmation');
const {
    createPaymentParams,
    getPaymentFormHtml,
    isPayUConfigured,
    setPayuBridgeHeaders,
    verifyPayUReverseHash,
    PAYU_ENDPOINT,
} = require('../services/paymentService');

const GST_RATE = 18;

/**
 * Prefix for PayU surl/furl. If API_BASE_URL already ends with /api, do not append again.
 * Same idea as demo/backend/routes/payments.js payuCallbackApiPrefix().
 */
function paymentApiCallbackPrefix() {
    const raw = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5555}`).replace(/\/+$/, '');
    return /\/api$/i.test(raw) ? raw : `${raw}/api`;
}

const PAYU_CALLBACK_PREFIX = paymentApiCallbackPrefix();

/** PayU redirects with POST; merge query + body like demo. */
const payuCallbackParams = (req) => ({ ...req.query, ...req.body });

async function buildAdvancePaymentParams(bookingId) {
    if (!isPayUConfigured()) {
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

    // PayU txnid maximum length is 25 chars.
    // 'TXN' (3) + slice(-8) (8) + random (8) = 19 chars
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const txnId = `TXN${bookingId.toString().slice(-8)}${randomHex}`;
    const firstName = (booking.name || '').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)[0] || 'Customer';
    const productInfo = `Property Measurement - ${booking.serviceType.substring(0, 50)} (${Date.now().toString().slice(-4)})`;

    const params = createPaymentParams({
        txnId,
        amount: amountToCharge,
        productInfo,
        firstName,
        email: booking.email,
        phone: (booking.phone || '').replace(/\D/g, '').slice(0, 10) || '9999999999',
        udf1: bookingId.toString(),
        udf2: '',
        surl: `${PAYU_CALLBACK_PREFIX}/payment/success`,
        furl: `${PAYU_CALLBACK_PREFIX}/payment/failure`,
    });

    return params;
}

function sendPayuHtml(res, status, html) {
    setPayuBridgeHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(status).send(html);
}

// POST /api/payment/initiate/booking — demo-style: JSON body { bookingId }, response is HTML (popup writes it)
router.post('/initiate/booking', async (req, res) => {
    if (!isPayUConfigured()) {
        return res.status(503).json({ success: false, message: 'Payment gateway not configured.' });
    }
    try {
        const bookingId = (req.body?.bookingId || '').toString().trim();
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'bookingId is required.' });
        }
        const params = await buildAdvancePaymentParams(bookingId);
        const html = getPaymentFormHtml(params);
        sendPayuHtml(res, 200, html);
    } catch (err) {
        console.error('Initiate booking payment error:', err);
        const code = err.statusCode || 500;
        if (!res.headersSent) {
            res.status(code).json({ success: false, message: err.message || 'Payment init failed.' });
        }
    }
});

// POST /api/payment/init — JSON params for legacy clients (optional payuUrl for client-side post)
router.post('/init', async (req, res) => {
    if (!isPayUConfigured()) {
        return res.status(500).json({ success: false, message: 'PayU credentials not configured.' });
    }
    try {
        const { bookingId } = req.body;
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'bookingId is required.' });
        }
        const params = await buildAdvancePaymentParams(bookingId);
        res.json({ success: true, data: { ...params, payuUrl: PAYU_ENDPOINT } });
    } catch (err) {
        console.error('Payment init error:', err);
        const code = err.statusCode || 500;
        res.status(code).json({ success: false, message: err.message || 'Payment init failed.' });
    }
});

async function handleAdvancePay(req, res) {
    const rawId = req.method === 'POST' ? req.body?.bookingId : req.query?.bookingId;
    const bookingId = (rawId != null ? String(rawId) : '').trim();

    const sendErrHtml = (status, body) => sendPayuHtml(res, status, body);

    try {
        if (!isPayUConfigured()) {
            return sendErrHtml(
                500,
                '<!doctype html><html><body style="font-family:Arial;padding:24px;"><h2>Configuration error</h2><p>Payment is not configured.</p></body></html>'
            );
        }
        if (!bookingId) {
            return sendErrHtml(
                400,
                '<!doctype html><html><body style="font-family:Arial;padding:24px;"><h2>Missing booking</h2><p>Please go back and try again.</p></body></html>'
            );
        }

        const params = await buildAdvancePaymentParams(bookingId);
        const html = getPaymentFormHtml(params);
        sendPayuHtml(res, 200, html);
    } catch (err) {
        console.error('Advance pay page error:', err);
        const code = err.statusCode || 500;
        const msg = (err.message || 'Something went wrong.').replace(/</g, '&lt;');
        sendErrHtml(
            code,
            `<!doctype html><html><body style="font-family:Arial;padding:24px;"><h2>Payment could not start</h2><p>${msg}</p><p><a href="javascript:history.back()">Go back</a></p></body></html>`
        );
    }
}

router.get('/advance/pay', (req, res) => {
    handleAdvancePay(req, res).catch((e) => {
        console.error('Advance pay async error:', e);
        if (!res.headersSent) res.status(500).send('Error');
    });
});

router.post('/advance/pay', (req, res) => {
    handleAdvancePay(req, res).catch((e) => {
        console.error('Advance pay async error:', e);
        if (!res.headersSent) res.status(500).send('Error');
    });
});

// GET /api/payment/remaining/pay?bookingId=XXX
router.get('/remaining/pay', async (req, res) => {
    try {
        if (!isPayUConfigured()) {
            return res.status(500).send('PayU credentials not configured.');
        }
        const bookingId = (req.query.bookingId || '').toString().trim();
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

        // 'RMN' (3) + slice(-8) (8) + random (8) = 19 chars
        const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
        const txnId = `RMN${bookingId.toString().slice(-8)}${randomHex}`;
        const firstName = (booking.name || '').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)[0] || 'Customer';
        const productInfo = `Remaining Payment - ${booking.serviceType.substring(0, 50)} (${Date.now().toString().slice(-4)})`;

        const params = createPaymentParams({
            txnId,
            amount: Number(booking.remainingAmount || 0),
            productInfo,
            firstName,
            email: booking.email,
            phone: (booking.phone || '').replace(/\D/g, '').slice(0, 10) || '9999999999',
            udf1: bookingId.toString(),
            udf2: '',
            surl: `${PAYU_CALLBACK_PREFIX}/payment/remaining/success`,
            furl: `${PAYU_CALLBACK_PREFIX}/payment/remaining/failure`,
        });

        const html = getPaymentFormHtml(params);
        sendPayuHtml(res, 200, html);
    } catch (err) {
        console.error('Remaining pay page error:', err);
        res.status(500).send('Something went wrong.');
    }
});

// POST /api/payment/remaining/success
router.post('/remaining/success', async (req, res) => {
    if (!process.env.PAYU_SALT) {
        return res.status(500).send('Config error.');
    }

    const body = payuCallbackParams(req);
    if (!verifyPayUReverseHash(body)) {
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

// POST /api/payment/remaining/failure
router.post('/remaining/failure', async (req, res) => {
    const bookingId = payuCallbackParams(req).udf1 || '';
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

// POST /api/payment/success
router.post('/success', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

    if (!process.env.PAYU_SALT) {
        return res.redirect(`${frontendUrl}/payment-failure?error=config`);
    }

    const body = payuCallbackParams(req);
    if (!verifyPayUReverseHash(body)) {
        console.error('PayU success hash verification failed');
        return res.redirect(`${frontendUrl}/payment-failure?error=hash&bookingId=${body.udf1 || ''}`);
    }

    const bookingId = body.udf1;
    if (!bookingId) {
        return res.redirect(`${frontendUrl}/payment-failure?error=no_booking`);
    }

    try {
        const booking = await Booking.findByIdAndUpdate(
            bookingId,
            {
                paymentStatus: 'Paid',
                payuTxnId: body.mihpayid || body.txnid,
                status: 'Confirmed',
            },
            { new: true }
        );

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

// POST /api/payment/failure
router.post('/failure', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const bookingId = payuCallbackParams(req).udf1 || '';

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
