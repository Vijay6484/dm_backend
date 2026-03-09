const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function test() {
  const form = new FormData();
  form.append('email', 'test@example.com');
  form.append('customer_name', 'Test User');
  
  // Create dummy PDFs
  fs.writeFileSync('dummy1.pdf', 'dummy pdf content');
  fs.writeFileSync('dummy2.pdf', 'dummy pdf content');
  
  form.append('certificate_pdf', fs.createReadStream('dummy1.pdf'));
  form.append('survey_pdf', fs.createReadStream('dummy2.pdf'));
  
  try {
    // Provide a valid bookingId. Let's fetch one from DB or just use a random hex since findById is used
    // Actually wait, if the booking ID doesn't exist, it returns 404!
    // We need a real booking ID.
  } catch(e) {}
}
test();
