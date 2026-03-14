const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generateSample() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: 'Inter', Arial, sans-serif;
                margin: 0;
                padding: 40px;
                color: #333;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 40px;
            }
            .project-info h2 {
                margin: 0;
                font-size: 14px;
                color: #666;
                font-weight: normal;
            }
            .project-info h1 {
                margin: 5px 0 0 0;
                font-size: 24px;
                font-weight: bold;
            }
            .date {
                font-size: 12px;
                color: #666;
            }
            .canvas {
                width: 100%;
                height: 500px;
                border: 1px dashed #ccc;
                position: relative;
                margin-bottom: 40px;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            /* Mocking the floor plan shape */
            .plan-shape {
                width: 300px;
                height: 400px;
                border: 2px dashed #0F2B46;
                position: relative;
            }
            .dim-label {
                position: absolute;
                font-size: 10px;
                color: #666;
                background: white;
                padding: 2px 5px;
            }
            .dim-top { top: -10px; left: 50%; transform: translateX(-50%); }
            .dim-right { right: -30px; top: 50%; transform: translateY(-50%) rotate(90deg); }
            .dim-bottom { bottom: -10px; left: 50%; transform: translateX(-50%); }
            .dim-left { left: -30px; top: 50%; transform: translateY(-50%) rotate(-90deg); }

            .stats-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 60px;
                background: #f9f9f9;
            }
            .stats-table td {
                padding: 15px;
                border: 1px solid #eee;
                font-size: 12px;
            }
            .stats-label { color: #666; }
            .stats-value { font-weight: bold; text-align: right; }

            .footer {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                border-top: 1px solid #eee;
                padding-top: 20px;
            }
            .logo {
                font-size: 20px;
                font-weight: bold;
                letter-spacing: 2px;
            }
            .page-info { font-size: 12px; color: #666; }
            .website { font-size: 10px; color: #666; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="project-info">
                <h2>Project 3 / Workspace 1</h2>
                <h1>Room 1</h1>
            </div>
            <div class="date">11/03/26</div>
        </div>

        <div class="canvas">
            <div class="plan-shape">
                <div class="dim-label dim-top">10.00 m</div>
                <div class="dim-label dim-right">15.00 m</div>
                <div class="dim-label dim-bottom">10.00 m</div>
                <div class="dim-label dim-left">15.00 m</div>
            </div>
        </div>

        <table class="stats-table">
            <tr>
                <td class="stats-label">Floor area (Carpet):</td>
                <td class="stats-value">25.00 sq.ft</td>
                <td class="stats-label">Wall area:</td>
                <td class="stats-value">5.40 sq.ft</td>
            </tr>
            <tr>
                <td class="stats-label">Perimeter:</td>
                <td class="stats-value">40.00 ft</td>
                <td class="stats-label">Built-up Area:</td>
                <td class="stats-value">30.40 sq.ft</td>
            </tr>
        </table>

        <div class="footer">
            <div class="logo">DOMETRIKS</div>
            <div class="page-info">1/1</div>
            <div>
                <a href="https://dometriks.com" class="website">www.dometriks.com</a>
            </div>
        </div>
    </body>
    </html>
    `;

    await page.setContent(htmlContent);
    await page.pdf({
        path: 'sample_plan.pdf',
        format: 'A4',
        printBackground: true
    });

    await browser.close();
    console.log('Sample PDF generated at sample_plan.pdf');
}

generateSample().catch(err => {
    console.error(err);
    process.exit(1);
});
