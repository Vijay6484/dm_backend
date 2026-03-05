const axios = require('axios');

async function testRegistration() {
  try {
    const res = await axios.post('http://localhost:5001/api/engineers/register', {
      firstName: "Test",
      lastName: "AutoActive",
      email: `test_${Date.now()}@example.com`,
      phone: "1234567890",
      city: "AutoCity",
      degreeFilename: "auto_test.pdf",
      agreedToTerms: true
    });
    console.log("Registration Success:", res.data);
    console.log("Default Status:", res.data.data.status);

  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testRegistration();
