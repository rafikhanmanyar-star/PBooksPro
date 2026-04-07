const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'backend', 'src', 'routes');

function migrate(src) {
  let out = src;

  // VERSION_CONFLICT / CONFLICT block with serverVersion (multi-line)
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*\r?\n\s*success:\s*false,\s*\r?\n\s*message:\s*'Record was modified by another user',\s*\r?\n\s*code:\s*'(VERSION_CONFLICT|CONFLICT)',\s*\r?\n\s*serverVersion:\s*([^,]+),\s*\r?\n\s*\}\);/g,
    (_m, code, sv) =>
      `sendFailure(res, 409, '${code}', 'Record was modified by another user', { serverVersion: ${sv.trim()} });`
  );

  // pmCycleAllocations conflict
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'CONFLICT'\s*\}\);/g,
    `sendFailure(res, 409, 'CONFLICT', msg);`
  );

  // res.status(200).json({ success: true, data: apiRow }) and 201 variants
  out = out.replace(
    /res\.status\(result\.wasInsert \? 201 : 200\)\.json\(\{\s*success:\s*true,\s*data:\s*apiRow\s*\}\);/g,
    'sendSuccess(res, apiRow, result.wasInsert ? 201 : 200);'
  );

  // journalRoutes specific
  out = out.replace(
    /res\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'JOURNAL_ERROR'\s*\}\);/g,
    `sendFailure(res, 400, 'JOURNAL_ERROR', msg);`
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
