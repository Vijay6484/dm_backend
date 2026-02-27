const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        phone: { type: String, required: true, trim: true },
        location: { type: String, required: true, trim: true },
        serviceType: { type: String, required: true },
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
    },
    { timestamps: true }
);

BookingSchema.index({ locationCoordinates: '2dsphere' });

module.exports = mongoose.model('Booking', BookingSchema);
