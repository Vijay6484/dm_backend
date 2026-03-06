<?php
/**
 * upload_report.php — Dometriks Report Upload & PDF Merge
 * 
 * Receives two PDF files (survey_pdf and certificate_pdf), merges them into 
 * one combined PDF, and stores it on the server. Returns the URL of the 
 * merged file.
 * 
 * Expects: multipart/form-data POST with:
 *   - survey_pdf: The engineer's survey PDF file
 *   - certificate_pdf: The auto-generated certificate PDF file
 *   - booking_id: The booking ID (used for filename)
 *   - customer_name: Customer name (for metadata)
 * 
 * Returns JSON:
 *   { success: true, file_url: "https://dometriks.com/reports/merged_xxx.pdf",
 *     survey_url: "...", certificate_url: "..." }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

// Check for required files
if (!isset($_FILES['survey_pdf']) || $_FILES['survey_pdf']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'survey_pdf file is required.']);
    exit;
}

if (!isset($_FILES['certificate_pdf']) || $_FILES['certificate_pdf']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'certificate_pdf file is required.']);
    exit;
}

// Configuration
$uploadDir = __DIR__ . '/reports/';
$baseUrl = 'https://dometriks.com/reports/';

// Create reports directory if it doesn't exist
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Generate unique filenames
$timestamp = time();
$bookingId = isset($_POST['booking_id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['booking_id']) : 'unknown';
$customerName = isset($_POST['customer_name']) ? $_POST['customer_name'] : 'Customer';

$surveyFilename = "survey_{$bookingId}_{$timestamp}.pdf";
$certFilename = "certificate_{$bookingId}_{$timestamp}.pdf";
$mergedFilename = "report_{$bookingId}_{$timestamp}.pdf";

$surveyPath = $uploadDir . $surveyFilename;
$certPath = $uploadDir . $certFilename;
$mergedPath = $uploadDir . $mergedFilename;

// Move uploaded files to reports directory
if (!move_uploaded_file($_FILES['survey_pdf']['tmp_name'], $surveyPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to save survey PDF.']);
    exit;
}

if (!move_uploaded_file($_FILES['certificate_pdf']['tmp_name'], $certPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to save certificate PDF.']);
    exit;
}

// Try to merge PDFs using various available methods
$merged = false;

// Method 1: Use Python with PyPDF2/pypdf (most common on shared hosting)
if (!$merged) {
    $pythonScript = <<<PYTHON
import sys
try:
    from pypdf import PdfMerger
except ImportError:
    from PyPDF2 import PdfMerger

merger = PdfMerger()
merger.append(sys.argv[1])  # certificate first
merger.append(sys.argv[2])  # survey second
merger.write(sys.argv[3])
merger.close()
print("OK")
PYTHON;
    
    $tmpPy = tempnam(sys_get_temp_dir(), 'merge_') . '.py';
    file_put_contents($tmpPy, $pythonScript);
    
    $output = [];
    $returnCode = 0;
    exec("python3 " . escapeshellarg($tmpPy) . " " . 
         escapeshellarg($certPath) . " " . 
         escapeshellarg($surveyPath) . " " . 
         escapeshellarg($mergedPath) . " 2>&1", $output, $returnCode);
    
    unlink($tmpPy);
    
    if ($returnCode === 0 && file_exists($mergedPath)) {
        $merged = true;
    }
}

// Method 2: Use ghostscript (gs) if available
if (!$merged) {
    $output = [];
    $returnCode = 0;
    exec("gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -sOutputFile=" . 
         escapeshellarg($mergedPath) . " " . 
         escapeshellarg($certPath) . " " . 
         escapeshellarg($surveyPath) . " 2>&1", $output, $returnCode);
    
    if ($returnCode === 0 && file_exists($mergedPath)) {
        $merged = true;
    }
}

// Method 3: Use pdfunite (poppler-utils) if available
if (!$merged) {
    $output = [];
    $returnCode = 0;
    exec("pdfunite " . 
         escapeshellarg($certPath) . " " . 
         escapeshellarg($surveyPath) . " " .
         escapeshellarg($mergedPath) . " 2>&1", $output, $returnCode);
    
    if ($returnCode === 0 && file_exists($mergedPath)) {
        $merged = true;
    }
}

// If no merge method worked, just use the certificate as the "merged" file
// and return both individual URLs
if (!$merged) {
    // Copy certificate as the merged file (at least the certificate gets through)
    copy($certPath, $mergedPath);
}

// Build response
$response = [
    'success' => true,
    'file_url' => $baseUrl . $mergedFilename,
    'survey_url' => $baseUrl . $surveyFilename,
    'certificate_url' => $baseUrl . $certFilename,
    'merged' => $merged,
    'booking_id' => $bookingId,
    'customer_name' => $customerName,
];

echo json_encode($response);
