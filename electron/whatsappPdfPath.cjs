const path = require('path');

function buildSafeWhatsAppPdfPath(dir, fileName, timestamp = Date.now()) {
  const baseName = path.basename(String(fileName || 'report.pdf'));
  const safeName = baseName.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').trim();
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error('Invalid PDF filename');
  }

  const root = path.resolve(dir);
  const fullPath = path.resolve(root, `${timestamp}-${safeName}`);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new Error('Invalid PDF filename');
  }
  return fullPath;
}

module.exports = { buildSafeWhatsAppPdfPath };
