const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Engineer = require('../models/Engineer');

// GET /api/analytics/dashboard — get dashboard KPI numbers and charts
router.get('/dashboard', async (req, res) => {
    try {
        // 1. Top-level counts
        const totalBookings = await Booking.countDocuments();
        const completedBookings = await Booking.countDocuments({ status: 'Completed' });
        const confirmedBookings = await Booking.countDocuments({ status: 'Confirmed' });
        const pendingBookings = await Booking.countDocuments({ status: 'Pending' });
        const cancelledBookings = await Booking.countDocuments({ status: 'Cancelled' });

        const totalEngineers = await Engineer.countDocuments();
        const activeEngineers = await Engineer.countDocuments({ status: 'Active' });

        // 2. Monthly Bookings (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // 6 months incl current
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const monthlyDataRaw = await Booking.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Format to month abbreviations
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthly = monthlyDataRaw.map(d => {
            const [year, month] = d._id.split('-');
            return {
                month: months[parseInt(month) - 1],
                count: d.count
            };
        });

        // 3. Service Type Split
        const serviceDataRaw = await Booking.aggregate([
            {
                $group: {
                    _id: "$serviceType",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const colors = ["#1e3a5f", "#2e5996", "#4a7dc0", "#7aaee0", "#b3d4f5", "#d6e8f9"];
        const serviceSplit = serviceDataRaw.map((s, i) => ({
            label: s._id,
            value: totalBookings > 0 ? Math.round((s.count / totalBookings) * 100) : 0,
            color: colors[i % colors.length]
        })).filter(s => s.value > 0);

        // 4. Return Data
        res.json({
            success: true,
            data: {
                counts: {
                    bookings: {
                        total: totalBookings,
                        completed: completedBookings,
                        confirmed: confirmedBookings,
                        pending: pendingBookings,
                        cancelled: cancelledBookings,
                    },
                    engineers: {
                        total: totalEngineers,
                        active: activeEngineers,
                    }
                },
                monthly,
                serviceSplit
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
