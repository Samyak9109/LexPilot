const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUpload } = require('../upload-validation');

test('accepts a non-empty PDF with a matching extension and MIME type', () => {
  assert.deepEqual(validateUpload({
    originalname: 'lease.pdf',
    mimetype: 'application/pdf',
    size: 1024,
  }), { valid: true });
});

test('rejects an empty upload with a specific user-facing error', () => {
  assert.deepEqual(validateUpload({
    originalname: 'lease.pdf',
    mimetype: 'application/pdf',
    size: 0,
  }), { valid: false, error: 'The uploaded file is empty.' });
});

test('rejects mismatched extensions instead of trusting a browser MIME type', () => {
  assert.deepEqual(validateUpload({
    originalname: 'lease.exe',
    mimetype: 'application/pdf',
    size: 1024,
  }), { valid: false, error: 'Invalid file type. Only PDF and DOCX files are allowed.' });
});

test('rejects files above the 20 MB product limit', () => {
  assert.deepEqual(validateUpload({
    originalname: 'lease.pdf',
    mimetype: 'application/pdf',
    size: 20 * 1024 * 1024 + 1,
  }), { valid: false, error: 'File size exceeds the 20 MB limit.' });
});
