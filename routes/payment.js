const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Booking = require('../models/Booking');

const GST_RATE = 18;
const PAYU_TEST_URL = 'https://test.payu.in/_payment';
const PAYU_PROD_URL = 'https://secure.payu.in/_payment';

function getPayuUrl() {
    return process.env.PAYU_MODE === 'production' ? PAYU_PROD_URL : PAYU_TEST_URL;
}

function generatePayuHash(params, salt) {
    const udf1 = params.udf1 || '';
    const udf2 = params.udf2 || '';
    const udf3 = params.udf3 || '';
    const udf4 = params.udf4 || '';
    const udf5 = params.udf5 || '';
    const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
    return crypto.createHash('sha512').update(hashString).digest('hex');
}

function verifyPayuResponseHash(body, salt) {
    const hashString = `${salt}|${body.status}||||||${body.udf5 || ''}|${body.udf4 || ''}|${body.udf3 || ''}|${body.udf2 || ''}|${body.udf1 || ''}|${body.email}|${body.firstname}|${body.productinfo}|${body.amount}|${body.txnid}|${body.key}`;
    const expectedHash = crypto.createHash('sha512').update(hashString).digest('hex');
    return expectedHash === (body.hash || body.hashes?.sha512 || '');
}

// POST /api/payment/init — generate PayUMoney params for a booking
router.post('/init', async (req, res) => {
    try {
        const { bookingId } = req.body;
        const key = process.env.PAYU_MERCHANT_KEY;
        const salt = process.env.PAYU_SALT;

        if (!key || !salt) {
            return res.status(500).json({ success: false, message: 'PayU credentials not configured.' });
        }
        if (!bookingId) {
            return res.status(400).json({ success: false, message: 'bookingId is required.' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        if (booking.paymentStatus === 'Paid') {
            return res.status(400).json({ success: false, message: 'Booking already paid.' });
        }

        const totalAmount = booking.totalAmount || booking.amount;
        const amountStr = totalAmount.toFixed(2);
        const txnid = `TXN${bookingId.toString().slice(-8)}${Date.now().toString(36).toUpperCase()}`;

        const firstname = (booking.name || '').replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)[0] || 'Customer';
        const productinfo = `Property Measurement - ${booking.serviceType}`;

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
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
        params.payuUrl = getPayuUrl();

        res.json({ success: true, data: params });
    } catch (err) {
        console.error('Payment init error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
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
        await Booking.findByIdAndUpdate(bookingId, {
            paymentStatus: 'Paid',
            payuTxnId: body.mihpayid || body.txnid,
        });
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
