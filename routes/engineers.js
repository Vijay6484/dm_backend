const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Engineer = require('../models/Engineer');

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer setup for report file uploads (stored in memory for email attachment)
const reportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Routes ────────────────────────────────────────────────────────────────────

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// POST /api/engineers/register — register engineer with external degree upload
router.post('/register', async (req, res) => {
    console.log('Incoming Engineer Registration:', req.body);
    try {
        const {
            firstName, lastName, email, phone,
            licenseNumber, yearsExperience, city, agreedToTerms,
            degreeFilename, degreeOriginalName
        } = req.body;

        if (!firstName) return res.status(400).json({ success: false, message: 'Missing required field: firstName' });
        if (!lastName) return res.status(400).json({ success: false, message: 'Missing required field: lastName' });
        if (!email) return res.status(400).json({ success: false, message: 'Missing required field: email' });
        if (!phone) return res.status(400).json({ success: false, message: 'Missing required field: phone' });
        if (!city) return res.status(400).json({ success: false, message: 'Missing required field: city' });

        if (!degreeFilename) {
            return res.status(400).json({ success: false, message: 'Degree certificate filename is required.' });
        }

        if (agreedToTerms !== 'true' && agreedToTerms !== true) {
            return res.status(400).json({ success: false, message: 'You must agree to the terms.' });
        }

        // Auto-generate a secure 8-character password
        const generatedPassword = crypto.randomBytes(4).toString('hex'); // 8 hex characters
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        const engineer = await Engineer.create({
            firstName, lastName, email, phone,
            licenseNumber: licenseNumber || '',
            yearsExperience: Number(yearsExperience) || 0,
            city,
            password: hashedPassword,
            degreeFilename: degreeFilename,
            degreeOriginalName: degreeOriginalName || degreeFilename,
            agreedToTerms: true,
        });

        // Send email with credentials
        try {
            await transporter.sendMail({
                from: `"dometriks Admin" <${process.env.SMTP_USER || 'noreply@dometriks.com'}>`, // sender address
                to: email, // list of receivers
                subject: "Welcome to dometriks - Your Login Credentials", // Subject line
                html: `
                    <h2>Welcome, ${firstName} ${lastName}!</h2>
                    <p>Thank you for registering as an engineer with dometriks.</p>
                    <p>Your account has been actively created! Below are your auto-generated login credentials for the engineer app:</p>
                    <p><strong>Email (ID):</strong> ${email}</p>
                    <p><strong>Password:</strong> ${generatedPassword}</p>
                    <br/>
                    <p>Please keep this email safe. You can log in immediately.</p>
                    <p>Best regards,<br/>The dometriks Team</p>
                `, // html body
            });
            console.log(`Email sent successfully to ${email}`);
        } catch (emailErr) {
            console.error("Failed to send welcome email:", emailErr);
            // We don't fail the registration if the email fails, we still return success 
            // but maybe we can include a warning.
        }

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
                status: engineer.status,
                phone: engineer.phone,
                profilePhoto: engineer.profilePhoto
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

// PATCH /api/engineers/:id/profile-photo — update engineer's profile photo
router.patch('/:id/profile-photo', async (req, res) => {
    try {
        const { profilePhoto } = req.body;

        if (!profilePhoto) {
            return res.status(400).json({ success: false, message: 'Profile photo URL is required.' });
        }

        const engineer = await Engineer.findByIdAndUpdate(
            req.params.id,
            { profilePhoto },
            { new: true }
        );

        if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found.' });

        res.json({ success: true, message: 'Profile photo updated successfully!', data: engineer });
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

        // Find bookings that are open for allocation, have NO assigned engineer,
        // are fully paid, and are within 10km.
        // Note: payment success sets booking status to 'Confirmed', so include it.
        const bookings = await Booking.find({
            status: { $in: ['Unassigned', 'Pending', 'Confirmed'] },
            engineerStatus: { $in: ['Unassigned', 'Pending'] },
            assignedEngineerId: null,
            paymentStatus: 'Paid',
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

// PATCH /api/engineers/:id/status — activate / deactivate
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['Active', 'Inactive'];
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
            status: { $in: ['Assigned', 'Survey Done'] },
            paymentStatus: 'Paid',
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
        const { documentFilename, documentOriginalName, certificateNumber } = req.body;
        if (!documentFilename) {
            return res.status(400).json({ success: false, message: 'Document filename is required.' });
        }
        const update = {
            status: 'Completed',
            engineerStatus: 'Completed',
            documentFilename: documentFilename,
            documentOriginalName: documentOriginalName || documentFilename,
        };
        if (certificateNumber && typeof certificateNumber === 'string' && certificateNumber.trim()) {
            update.certificateNumber = certificateNumber.trim().toUpperCase();
        }
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.bookingId, assignedEngineerId: req.params.id },
            update,
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

// POST /api/engineers/:id/bookings/:bookingId/send-report — email the report PDFs to customer
router.post('/:id/bookings/:bookingId/send-report',
    reportUpload.fields([
        { name: 'survey_pdf', maxCount: 1 },
        { name: 'certificate_pdf', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const { email, customer_name } = req.body;
            const booking = await Booking.findById(req.params.bookingId);

            if (!booking) {
                return res.status(404).json({ success: false, message: 'Booking not found.' });
            }

            const customerEmail = email || booking.email;
            const customerName = customer_name || booking.name;

            if (!customerEmail) {
                return res.status(400).json({ success: false, message: 'Customer email is required.' });
            }

            // Build email attachments from uploaded files
            const attachments = [];

            if (req.files && req.files['certificate_pdf'] && req.files['certificate_pdf'][0]) {
                attachments.push({
                    filename: `Dometriks_Certificate_${booking._id}.pdf`,
                    content: req.files['certificate_pdf'][0].buffer,
                    contentType: 'application/pdf',
                });
            }

            if (req.files && req.files['survey_pdf'] && req.files['survey_pdf'][0]) {
                attachments.push({
                    filename: `Dometriks_Survey_Report_${booking._id}.pdf`,
                    content: req.files['survey_pdf'][0].buffer,
                    contentType: 'application/pdf',
                });
            }

            if (attachments.length === 0) {
                return res.status(400).json({ success: false, message: 'At least one PDF file is required.' });
            }

            // Send email with PDF attachments
            await transporter.sendMail({
                from: `"Dometriks" <${process.env.SMTP_USER || 'noreply@dometriks.com'}>`,
                to: customerEmail,
                subject: `Your Dometriks Site Measurement Report - ${booking.location || 'Property'}`,
                html: `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #0F2B46; padding: 24px; text-align: center;">
                            <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">DOMETRIKS</h1>
                            <p style="color: #38B6FF; margin: 5px 0 0; font-size: 12px; letter-spacing: 3px;">PROPERTY MEASUREMENT PLATFORM</p>
                        </div>
                        <div style="padding: 30px; background: #FFFFFF;">
                            <h2 style="color: #0F2B46; margin-top: 0;">Dear ${customerName},</h2>
                            <p style="color: #475569; line-height: 1.6;">
                                Thank you for choosing Dometriks for your property measurement needs.
                                Your site measurement has been completed successfully.
                            </p>
                            <p style="color: #475569; line-height: 1.6;">
                                Please find attached:
                            </p>
                            <ul style="color: #475569; line-height: 1.8;">
                                <li><strong>Verification Certificate</strong> — Official measurement certification</li>
                                <li><strong>Survey Report</strong> — Detailed measurement data from the site visit</li>
                            </ul>
                            <div style="background: #F1F5F9; border-left: 4px solid #38B6FF; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                                <p style="color: #475569; margin: 0; font-size: 13px;">
                                    <strong>Property:</strong> ${booking.location || 'N/A'}<br/>
                                    <strong>Service:</strong> ${booking.serviceType || 'Site Measurement'}<br/>
                                    <strong>Date:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <p style="color: #475569; line-height: 1.6;">
                                If you have any questions about your report, please don't hesitate to contact us.
                            </p>
                            <p style="color: #475569;">
                                Best regards,<br/>
                                <strong>The Dometriks Team</strong>
                            </p>
                        </div>
                        <div style="background: #0F2B46; padding: 16px; text-align: center;">
                            <p style="color: #94A3B8; margin: 0; font-size: 11px;">
                                © ${new Date().getFullYear()} Dometriks Solutions · www.dometriks.com
                            </p>
                        </div>
                    </div>
                `,
                attachments,
            });

            console.log(`Report email sent to ${customerEmail} for booking ${booking._id}`);
            res.json({ success: true, message: 'Report emailed successfully.' });
        } catch (err) {
            console.error('Send report email error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

module.exports = router;
