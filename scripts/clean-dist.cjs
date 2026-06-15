#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
  console.log('[clean-dist] Removed dist/');
} else {
  console.log('[clean-dist] dist/ already absent');
}
