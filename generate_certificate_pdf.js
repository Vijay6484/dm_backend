const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * generatePDF - Local test script to verify certificate layout
 * This script mimics the production flow by:
 * 1. Reading the HTML template
 * 2. Injecting mock data into placeholders
 * 3. Converting the signature image to base64 (ensures it shows in PDF)
 * 4. Generating the PDF using Puppeteer
 */
async function generatePDF() {
    try {
        console.log('Launching browser...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Path to your certificate HTML and signature
        const htmlPath = path.resolve(__dirname, '../final certificate.html');
        const signaturePath = path.resolve(__dirname, 'signature.png');
        console.log(`Loading HTML template from: ${htmlPath}`);

        // Read the HTML content
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Handle signature image as base64 for reliable PDF generation
        let signatureBase64 = '';
        if (fs.existsSync(signaturePath)) {
            const sigBuffer = fs.readFileSync(signaturePath);
            signatureBase64 = `data:image/png;base64,${sigBuffer.toString('base64')}`;
            console.log('Signature image found and converted to base64.');
        } else {
            console.warn(`Warning: Signature NOT found at ${signaturePath}`);
        }

        // Mock data to inject (Cleaned up - no built-up area)
        const mockData = {
            '{{certificate_number}}': 'DMTX-2026-000982',
            '{{issue_date}}': '15 March 2026',
            '{{property_address}}': 'Villa 45, Sterling Highlands, Lonavala, Maharashtra - 410401',
            '{{carpet_area_sqm}}': '210.45',
            '{{carpet_area_sqft}}': '2265.20',
            '{{inspection_date}}': '10 March 2026'
        };

        // Replace placeholders
        for (const [key, value] of Object.entries(mockData)) {
            htmlContent = htmlContent.replace(new RegExp(key, 'g'), value);
        }

        // Specifically replace the signature image source with base64 string
        // This solves the "image not coming" issue in local PDF generation
        if (signatureBase64) {
            htmlContent = htmlContent.replace('src="signature.png"', `src="${signatureBase64}"`);
        }

        // We write a temporary filled HTML to the backend folder
        // This ensures relative assets (if there were any) are resolved relative to backend/
        const tempHtmlPath = path.resolve(__dirname, 'temp_certificate_filled.html');
        fs.writeFileSync(tempHtmlPath, htmlContent);

        // Navigate to the file
        await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });

        const timestamp = new Date().getTime();
        const outputPath = path.resolve(__dirname, `../check_certificate_${timestamp}.pdf`);
        console.log(`Generating PDF at: ${outputPath}`);

        await page.pdf({
            path: outputPath,
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        await browser.close();
        console.log(`\nSuccess! PDF generated.`);
        console.log(`Data used:`);
        console.table(mockData);
        console.log(`\nView the result: ${outputPath}`);

    } catch (error) {
        console.error('Error generating PDF:', error);
    }
}

generatePDF();
