const mongoose = require('mongoose');
const Booking = require('./models/Booking');

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/axaraTest', { useNewUrlParser: true, useUnifiedTopology: true });
        await Booking.init();

        // delete all
        await Booking.deleteMany({});

        const b = await Booking.create({
            name: "Test", email: "a@b.com", phone: "123", location: "Loc", serviceType: "Type"
        });

        console.log("Created successfully with locationCoordinates:", JSON.stringify(b.toObject(), null, 2));
        await mongoose.disconnect();
    } catch (e) {
        console.error("ERROR:", e.message);
        process.exit(1);
    }
}
run();
