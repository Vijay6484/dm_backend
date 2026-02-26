const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Engineer = require('./models/Engineer');

require('dotenv').config();

async function createTestEngineer() {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await Engineer.findOne({ email: 'test@example.com' });
    if (existing) {
        console.log('Test engineer already exists: test@example.com / password123');
        process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const testEngineer = new Engineer({
        firstName: 'Test',
        lastName: 'Engineer',
        email: 'test@example.com',
        password: hashedPassword,
        phone: '1234567890',
        city: 'Mumbai',
        country: 'India',
        discipline: 'Civil',
        agreedToTerms: true,
        status: 'Active' // Approving it right away so they can log in
    });

    await testEngineer.save();
    console.log('Test engineer created successfully! Email: test@example.com / Password: password123');
    process.exit(0);
}

createTestEngineer().catch(err => {
    console.error(err);
    process.exit(1);
});
