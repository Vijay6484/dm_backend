const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, default: '', trim: true, lowercase: true },
        phone: { type: String, required: true, trim: true },
        location: { type: String, required: true, trim: true },
        serviceType: { type: String, required: true },
        units: { type: Number, default: null },
        description: { type: String, default: '' },
        scheduleNow: { type: Boolean, default: true },
        scheduleDate: { type: String, default: '' },
        scheduleTime: { type: String, default: '' },
        locationCoordinates: {
            type: {
                type: String,
                enum: ['Point'],
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: undefined,
            }
        },
        assignedEngineerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Engineer',
            default: null,
        },
        engineerStatus: {
            type: String,
            enum: ['Unassigned', 'Pending', 'Accepted', 'Assigned', 'Survey Done', 'Completed'],
            default: 'Unassigned',
        },
        status: {
            type: String,
            enum: ['Unassigned', 'Assigned', 'Survey Done', 'Pending', 'Confirmed', 'Completed', 'Cancelled'],
            default: 'Unassigned',
        },
        documentFilename: { type: String, default: null },
        documentOriginalName: { type: String, default: null },
        amount: { type: Number, default: 1999 },
        amountBeforeGst: { type: Number, default: null },
        gstAmount: { type: Number, default: null },
        gstRate: { type: Number, default: 18 },
        totalAmount: { type: Number, default: null },
        paymentStatus: {
            type: String,
            enum: ['Pending', 'Paid', 'Failed'],
            default: 'Pending',
        },
        payuTxnId: { type: String, default: null },
        verificationCode: { type: String, required: true },
        certificateNumber: { type: String, default: null, unique: true, sparse: true },
    },
    { timestamps: true }
);

BookingSchema.index({ locationCoordinates: '2dsphere' });

module.exports = mongoose.model('Booking', BookingSchema);
