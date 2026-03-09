<?php
/**
 * upload_photo.php — Dometriks Engineer Profile Photo Upload
 * 
 * Simple PHP script to receive an engineer's profile photo,
 * store it on the server, and return its public URL.
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

// Check for required file
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'No file uploaded or upload error occurred.']);
    exit;
}

// Configuration
$uploadDir = __DIR__ . '/photos/';
$baseUrl = 'https://dometriks.com/photos/';

// Create photos directory if it doesn't exist
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Generate unique filename
$timestamp = time();
$originalName = preg_replace('/[^a-zA-Z0-9._-]/', '', $_FILES['file']['name']);
$filename = "photo_{$timestamp}_{$originalName}";
$targetPath = $uploadDir . $filename;

// Move uploaded file to photos directory
if (move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
    echo json_encode([
        'success' => true,
        'message' => 'File uploaded successfully!',
        'file_url' => $baseUrl . $filename
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to save uploaded file.']);
}
