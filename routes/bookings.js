const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Booking = require('../models/Booking');
const { buildBookingConfirmationHtml } = require('../utils/booking_confirmation_pdf');
const { renderPdfBufferFromHtml } = require('../utils/render_pdf');

// POST /api/bookings — create a new booking
router.post('/', async (req, res) => {
    console.log('Incoming Booking Request:', req.body);
    try {
        const {
            name, email, phone, location, serviceType, units,
            description, scheduleNow, scheduleDate, scheduleTime,
            latitude, longitude, amount, paymentStatus
        } = req.body;

        if (!name) return res.status(400).json({ success: false, message: 'Missing required field: name' });
        if (!email) return res.status(400).json({ success: false, message: 'Missing required field: email' });
        if (!phone) return res.status(400).json({ success: false, message: 'Missing required field: phone' });
        if (!location) return res.status(400).json({ success: false, message: 'Missing required field: location' });
        if (!serviceType) return res.status(400).json({ success: false, message: 'Missing required field: serviceType' });

        const verificationCode = crypto.randomBytes(4).toString('hex').toUpperCase();

        const unitsNum = units !== undefined && units !== '' ? Number(units) : 1;

        // Pricing model:
        // - Full service fee is based on units (used for remaining due on arrival)
        // - Online payment is an advance booking amount (₹200 + GST) only
        // Note: `amount` coming from frontend is ignored for safety; backend is source of truth.
        const SERVICE_FEE_PER_UNIT = 1999;
        const ADVANCE_BASE = 200;
        const gstRate = 18;

        const baseAmount = unitsNum * SERVICE_FEE_PER_UNIT;
        const gstAmount = Math.round(baseAmount * (gstRate / 100) * 100) / 100;
        const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;

        const advanceAmount = ADVANCE_BASE;
        const advanceGstAmount = Math.round(advanceAmount * (gstRate / 100) * 100) / 100;
        const advanceTotalAmount = Math.round((advanceAmount + advanceGstAmount) * 100) / 100;
        const remainingAmount = Math.max(0, Math.round((totalAmount - advanceTotalAmount) * 100) / 100);
        const remainingPaymentStatus = remainingAmount <= 0 ? 'Paid' : 'Pending';

        const bookingData = {
            name, email, phone, location, serviceType,
            units: units !== undefined && units !== '' ? Number(units) : null,
            description,
            verificationCode,
            amount: baseAmount, // kept for backward compatibility
            amountBeforeGst: baseAmount,
            gstAmount,
            gstRate,
            totalAmount,
            advanceAmount,
            advanceGstAmount,
            advanceTotalAmount,
            remainingAmount,
            remainingPaymentStatus,
            // When user clicks \"Book Measurement Visit\" on the website,
            // we always start with payment pending and booking status pending.
            paymentStatus: paymentStatus === 'Paid' ? 'Paid' : 'Pending',
            status: 'Pending',
            engineerStatus: 'Unassigned',
            scheduleNow: scheduleNow !== false,
            scheduleDate: scheduleNow !== false ? '' : scheduleDate,
            scheduleTime: scheduleNow !== false ? '' : scheduleTime,
        };

        if (latitude !== undefined && longitude !== undefined && latitude !== '' && longitude !== '') {
            bookingData.locationCoordinates = {
                type: 'Point',
                coordinates: [Number(longitude), Number(latitude)]
            };
        }

        const booking = await Booking.create(bookingData);

        res.status(201).json({ success: true, data: booking });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/bookings/verify?cert=XXX — find booking by certificate number (DMTX) for public verification
router.get('/verify', async (req, res) => {
    try {
        const cert = (req.query.cert || req.query.code || '').toString().trim().toUpperCase();
        if (!cert) return res.status(400).json({ success: false, message: 'Certificate number is required.' });
        const booking = await Booking.findOne({ certificateNumber: cert });
        if (!booking) return res.status(404).json({ success: false, message: 'No certificate found for this number.' });
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/bookings — list all bookings (newest first)
router.get('/', async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const filter = status ? { status } : {};
        const bookings = await Booking.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        const total = await Booking.countDocuments(filter);
        res.json({ success: true, total, data: bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/bookings/:id — get single booking
router.get('/:id', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/bookings/:id/confirmation-pdf — download booking confirmation PDF (with QR)
router.get('/:id/confirmation-pdf', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        const html = await buildBookingConfirmationHtml(booking);
        const pdfBuffer = await renderPdfBufferFromHtml(html);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="Booking_Confirmation_${booking._id}.pdf"`
        );
        res.status(200).send(pdfBuffer);
    } catch (err) {
        console.error('confirmation-pdf error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/bookings/:id/status — update booking status
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
        }
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
