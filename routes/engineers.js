const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Engineer = require('../models/Engineer');

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/engineers/register — register engineer with external degree upload
router.post('/register', async (req, res) => {
    try {
        const {
            firstName, lastName, email, phone, discipline,
            licenseNumber, yearsExperience, city, country, agreedToTerms, password,
            degreeFilename, degreeOriginalName
        } = req.body;

        if (!firstName || !lastName || !email || !phone || !discipline || !city || !country || !password) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        if (!degreeFilename) {
            return res.status(400).json({ success: false, message: 'Degree certificate filename is required.' });
        }

        if (agreedToTerms !== 'true' && agreedToTerms !== true) {
            return res.status(400).json({ success: false, message: 'You must agree to the terms.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const engineer = await Engineer.create({
            firstName, lastName, email, phone, discipline,
            licenseNumber: licenseNumber || '',
            yearsExperience: Number(yearsExperience) || 0,
            city, country,
            password: hashedPassword,
            degreeFilename: degreeFilename,
            degreeOriginalName: degreeOriginalName || degreeFilename,
            agreedToTerms: true,
        });

        res.status(201).json({ success: true, data: engineer });
    } catch (err) {
        // Duplicate email
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'An engineer with this email already exists.' });
        }
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/engineers/login — login engineer
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password.' });
        }

        const engineer = await Engineer.findOne({ email });
        if (!engineer) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
        if (engineer.status !== 'Active') {
            return res.status(403).json({ success: false, message: 'Account is not active. Status: ' + engineer.status });
        }

        const isMatch = await bcrypt.compare(password, engineer.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        // Setup token, omitting secret for brevity/demo as per user context unless dotenv is supplied
        const token = jwt.sign({ id: engineer._id }, process.env.JWT_SECRET || 'secret123', {
            expiresIn: '30d',
        });

        res.json({
            success: true, token, engineer: {
                _id: engineer._id,
                firstName: engineer.firstName,
                lastName: engineer.lastName,
                email: engineer.email,
                status: engineer.status
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/engineers/:id/location — update engineer's live location
router.patch('/:id/location', async (req, res) => {
    try {
        const { latitude, longitude, isOnline } = req.body;

        let updateQuery = {};
        if (latitude !== undefined && longitude !== undefined) {
            updateQuery.location = {
                type: 'Point',
                coordinates: [Number(longitude), Number(latitude)]
            };
        }
        if (isOnline !== undefined) {
            updateQuery.isOnline = Boolean(isOnline);
        }

        const engineer = await Engineer.findByIdAndUpdate(
            req.params.id,
            updateQuery,
            { new: true }
        );
        if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found.' });
        res.json({ success: true, message: 'Location updated via App.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const Booking = require('../models/Booking');

// GET /api/engineers/:id/nearby-bookings — fetch available bookings within 10km
router.get('/:id/nearby-bookings', async (req, res) => {
    try {
        const engineer = await Engineer.findById(req.params.id);
        if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found.' });
        if (!engineer.location || !engineer.location.coordinates || engineer.location.coordinates.length !== 2) {
            return res.status(400).json({ success: false, message: 'Engineer location not set.' });
        }

        const [lng, lat] = engineer.location.coordinates;
        const radiusInMeters = 10000; // 10 km

        // Find bookings that are 'Unassigned' (or 'Pending' for legacy), have NO assigned engineer, and are within 10km
        const bookings = await Booking.find({
            status: { $in: ['Unassigned', 'Pending'] },
            engineerStatus: { $in: ['Unassigned', 'Pending'] },
            assignedEngineerId: null,
            locationCoordinates: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    $maxDistance: radiusInMeters
                }
            }
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/engineers/:id/bookings/:bookingId/accept — accept a booking
router.patch('/:id/bookings/:bookingId/accept', async (req, res) => {
    try {
        const engineerId = req.params.id;
        const { bookingId } = req.params;

        // Atomic check: Ensure only the first person updates it if it's still null.
        const booking = await Booking.findOneAndUpdate(
            { _id: bookingId, assignedEngineerId: null, engineerStatus: { $in: ['Unassigned', 'Pending'] } },
            {
                assignedEngineerId: engineerId,
                engineerStatus: 'Assigned',
                status: 'Assigned'
            },
            { new: true }
        );

        if (!booking) {
            return res.status(400).json({ success: false, message: 'Booking already accepted or not available.' });
        }

        // Update engineer's stats
        await Engineer.findByIdAndUpdate(engineerId, {
            $inc: { acceptedCount: 1 }
        });

        res.json({ success: true, message: 'Contract accepted!', data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/engineers/:id/dashboard — get dashboard stats
router.get('/:id/dashboard', async (req, res) => {
    try {
        const engineer = await Engineer.findById(req.params.id);
        if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found.' });

        res.json({
            success: true, data: {
                earnings: engineer.earnings,
                acceptedCount: engineer.acceptedCount,
                rejectedCount: engineer.rejectedCount,
                isOnline: engineer.isOnline
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
router.get('/', async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const filter = status ? { status } : {};
        const engineers = await Engineer.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        const total = await Engineer.countDocuments(filter);
        res.json({ success: true, total, data: engineers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/engineers/:id — get single engineer
router.get('/:id', async (req, res) => {
    try {
        const engineer = await Engineer.findById(req.params.id);
        if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found.' });
        res.json({ success: true, data: engineer });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/engineers/:id/status — approve / reject / deactivate
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['Pending', 'Active', 'Inactive', 'Rejected'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
        }
        const engineer = await Engineer.findByIdAndUpdate(
            req.params.id, { status }, { new: true }
        );
        if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found.' });
        res.json({ success: true, data: engineer });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/engineers/:id/my-jobs — fetch assigned jobs for the engineer
router.get('/:id/my-jobs', async (req, res) => {
    try {
        const bookings = await Booking.find({
            assignedEngineerId: req.params.id,
            status: { $in: ['Assigned', 'Survey Done'] }
        }).sort({ updatedAt: -1 });
        res.json({ success: true, data: bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/engineers/:id/bookings/:bookingId/status — update job status to Survey Done
router.patch('/:id/bookings/:bookingId/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (status !== 'Survey Done') {
            return res.status(400).json({ success: false, message: 'Invalid status update.' });
        }
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.bookingId, assignedEngineerId: req.params.id },
            { status: 'Survey Done', engineerStatus: 'Survey Done' },
            { new: true }
        );
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
        res.json({ success: true, data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/engineers/:id/bookings/:bookingId/complete — complete job with external document upload
router.post('/:id/bookings/:bookingId/complete', async (req, res) => {
    try {
        const { documentFilename, documentOriginalName } = req.body;
        if (!documentFilename) {
            return res.status(400).json({ success: false, message: 'Document filename is required.' });
        }
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.bookingId, assignedEngineerId: req.params.id },
            {
                status: 'Completed',
                engineerStatus: 'Completed',
                documentFilename: documentFilename,
                documentOriginalName: documentOriginalName || documentFilename,
            },
            { new: true }
        );
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }
        res.json({ success: true, message: 'Job completed successfully!', data: booking });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
