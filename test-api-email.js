async function run() {
    try {
        const listRes = await fetch('http://localhost:5555/api/bookings');
        const list = await listRes.json();
        const booking = list.data[0];

        if (!booking) {
            console.log("No bookings found");
            return;
        }

        const bookingId = booking._id;
        const engineerId = "60c0be8cce4a484c861c44d8"; // Fake engineer ID

        const fs = require('fs');
        fs.writeFileSync('dummy1.pdf', 'dummy content 1');
        fs.writeFileSync('dummy2.pdf', 'dummy content 2');

        // Use Node 18 native fetch and FormData
        const form = new FormData();
        form.append('email', 'test@dometriks.com');
        form.append('customer_name', 'Test User');

        // FormData in Node 18 expects Blobs/Files
        const blob1 = new Blob([fs.readFileSync('dummy1.pdf')]);
        form.append('certificate_pdf', Object.assign(blob1, { name: 'dummy1.pdf' }), 'dummy1.pdf');

        const blob2 = new Blob([fs.readFileSync('dummy2.pdf')]);
        form.append('survey_pdf', Object.assign(blob2, { name: 'dummy2.pdf' }), 'dummy2.pdf');

        const url = `http://localhost:5555/api/engineers/${engineerId}/bookings/${bookingId}/send-report`;
        console.log("POSTing to", url);

        const res = await fetch(url, {
            method: 'POST',
            body: form
        });

        const text = await res.text();
        console.log(res.status, text);

    } catch (e) {
        console.error(e);
    }
}
run();
