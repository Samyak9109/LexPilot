const path = require('path');

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

function validateUpload(file) {
  if (!file || !file.size) {
    return { valid: false, error: 'The uploaded file is empty.' };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'File size exceeds the 20 MB limit.' };
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  if (ACCEPTED_TYPES.get(extension) !== file.mimetype) {
    return { valid: false, error: 'Invalid file type. Only PDF and DOCX files are allowed.' };
  }

  return { valid: true };
}

module.exports = { MAX_UPLOAD_BYTES, validateUpload };
