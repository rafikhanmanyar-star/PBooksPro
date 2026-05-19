const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSafeWhatsAppPdfPath } = require('../electron/whatsappPdfPath.cjs');

const dir = path.join(path.sep, 'tmp', 'pbooks-whatsapp-pdf');
const safe = buildSafeWhatsAppPdfPath(dir, '../../../outside.pdf', 123);

assert.equal(path.dirname(safe), dir);
assert.equal(path.basename(safe), '123-outside.pdf');

assert.throws(
  () => buildSafeWhatsAppPdfPath(dir, '..', 123),
  /Invalid PDF filename/
);

console.log('whatsapp PDF path tests passed');
