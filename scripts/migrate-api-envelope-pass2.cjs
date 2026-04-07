const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'backend', 'src', 'routes');

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function migrate(src) {
  let out = src;

  // res.status(400).json({ success: false, message: '...', code: '...' });
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*'((?:[^'\\]|\\.)*)',\s*code:\s*'([^']+)'\s*\}\);/g,
    (_m, msg, code) => `sendFailure(res, 400, '${code}', '${esc(msg)}');`
  );

  // res.status(409).json({ success: false, message: msg, code: 'DUPLICATE' });
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'DUPLICATE'\s*\}\);/g,
    `sendFailure(res, 409, 'DUPLICATE', msg);`
  );

  // res.status(409).json({ success: false, message: 'Version conflict', code: 'CONFLICT' });
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*success:\s*false,\s*message:\s*'Version conflict',\s*code:\s*'CONFLICT'\s*\}\);/g,
    `sendFailure(res, 409, 'CONFLICT', 'Version conflict');`
  );

  // res.status(409).json({ success: false, message: e.message, code: e.code });
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*success:\s*false,\s*message:\s*e\.message,\s*code:\s*e\.code\s*\}\);/g,
    `sendFailure(res, 409, String(e.code ?? 'CONFLICT'), e.message);`
  );

  // personalFinance style: res.status(code === 'CONFLICT' ? 409 : 400).json({ success: false, message: msg, code });
  out = out.replace(
    /res\.status\(code === 'CONFLICT' \? 409 : 400\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code\s*\}\);/g,
    `sendFailure(res, code === 'CONFLICT' ? 409 : 400, String(code), msg);`
  );

  out = out.replace(
    /res\.status\(code === 'CONFLICT' \? 409 : 500\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code\s*\}\);/g,
    `sendFailure(res, code === 'CONFLICT' ? 409 : 500, String(code), msg);`
  );

  // journal: res.status(status).json({ success: false, message: msg, code: status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR' });
  out = out.replace(
    /res\.status\(status\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*status === 404 \? 'NOT_FOUND' : 'SERVER_ERROR'\s*\}\);/g,
    `sendFailure(res, status, status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR', msg);`
  );

  // res.status(400).json({ success: false, message: '...', code: 'JOURNAL_ERROR' });
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*([^,]+),\s*code:\s*'JOURNAL_ERROR'\s*\}\);/g,
    (_m, msg) => `sendFailure(res, 400, 'JOURNAL_ERROR', ${msg.trim()});`
  );

  // usersRoutes 409 duplicate
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*success:\s*false,\s*message:\s*'Username already exists for this organization',\s*code:\s*'DUPLICATE'\s*\}\);/g,
    `sendFailure(res, 409, 'DUPLICATE', 'Username already exists for this organization');`
  );

  // usersRoutes invalid body
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*'Invalid body',\s*code:\s*'VALIDATION_ERROR'\s*\}\);/g,
    `sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body');`
  );

  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*'You cannot delete your own account while logged in',\s*code:\s*'INVALID'\s*\}\);/g,
    `sendFailure(res, 400, 'INVALID', 'You cannot delete your own account while logged in');`
  );

  // Multi-line res.status(400).json({ success: false, message: '...', code: 'HAS_DEPENDENCIES' })
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*\r?\n\s*success:\s*false,\s*\r?\n\s*message:\s*'((?:[^'\\]|\\.)*)',\s*\r?\n\s*code:\s*'([^']+)',\s*\r?\n\s*\}\);/g,
    (_m, msg, code) => `sendFailure(res, 400, '${code}', '${esc(msg)}');`
  );

  // Multi-line VERSION_CONFLICT
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*\r?\n\s*success:\s*false,\s*\r?\n\s*message:\s*'Record was modified by another user',\s*\r?\n\s*code:\s*'VERSION_CONFLICT',\s*\r?\n\s*serverVersion:\s*([^,]+),\s*\r?\n\s*\}\);/g,
    (_m, sv) => `sendFailure(res, 409, 'VERSION_CONFLICT', 'Record was modified by another user', { serverVersion: ${sv.trim()} });`
  );

  // locks: LOCK_LOST with 200
  out = out.replace(
    /res\.json\(\{\s*success:\s*false,\s*message:\s*'Lock no longer held',\s*code:\s*'LOCK_LOST'\s*\}\);/g,
    `sendFailure(res, 200, 'LOCK_LOST', 'Lock no longer held');`
  );

  // chat validation
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*'Cannot message yourself',\s*code:\s*'VALIDATION_ERROR'\s*\}\);/g,
    `sendFailure(res, 400, 'VALIDATION_ERROR', 'Cannot message yourself');`
  );
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*'withUserId required',\s*code:\s*'VALIDATION_ERROR'\s*\}\);/g,
    `sendFailure(res, 400, 'VALIDATION_ERROR', 'withUserId required');`
  );

  return out;
}

for (const f of fs.readdirSync(routesDir)) {
  if (!f.endsWith('.ts')) continue;
  const p = path.join(routesDir, f);
  const before = fs.readFileSync(p, 'utf8');
  const after = migrate(before);
  if (after !== before) {
    fs.writeFileSync(p, after, 'utf8');
    console.log('updated', f);
  }
}
console.log('done');
