const puppeteer = require('puppeteer');

async function renderPdfBufferFromHtml(html) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { renderPdfBufferFromHtml };

