const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// POST /api/bookings — create a new booking
router.post('/', async (req, res) => {
    try {
        const {
            name, email, phone, location, serviceType,
            description, scheduleNow, scheduleDate, scheduleTime,
            latitude, longitude
        } = req.body;

        if (!name || !email || !phone || !location || !serviceType) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        const bookingData = {
            name, email, phone, location, serviceType,
            description,
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
