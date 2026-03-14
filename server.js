require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const os = require('os');

const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payment');
const engineerRoutes = require('./routes/engineers');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 5555;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
    origin: '*', // Allow all origins for LAN access during development
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/bookings', bookingRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/engineers', engineerRoutes);
app.use('/api/analytics', analyticsRoutes);


// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ── MongoDB connection + server start ─────────────────────────────────────────
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB connected →', process.env.MONGO_URI);
        const networkInterfaces = os.networkInterfaces();
        let lanIp = 'localhost';
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    lanIp = iface.address;
                }
            }
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Dometriks backend running on http://localhost:${PORT}`);
            console.log(`🌍 LAN accessible at http://${lanIp}:${PORT}`);
            console.log(`   POST /api/bookings`);
            console.log(`   POST /api/engineers/register`);
            console.log(`   GET  /api/engineers/degree/:filename`);
        });
    })
    .catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });
