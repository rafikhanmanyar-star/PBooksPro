/**
 * Migrates backend route files to use sendFailure/sendSuccess/handleRouteError.
 * Run from repo root: node scripts/migrate-api-envelope.cjs
 */
const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'backend', 'src', 'routes');

const IMPORT = `import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';\n`;

function migrate(src, filename) {
  let out = src;

  if (!out.includes("from '../utils/apiResponse.js'")) {
    const firstNl = out.indexOf('\n');
    const insertAt = firstNl + 1;
    out = out.slice(0, insertAt) + IMPORT + out.slice(insertAt);
  }

  // Standard catch → handleRouteError (variable must be `e`)
  out = out.replace(
    /\r?\n[ \t]*const msg = e instanceof Error \? e\.message : String\(e\);\r?\n[ \t]*res\.status\(500\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'SERVER_ERROR'\s*\}\);/g,
    '\n    handleRouteError(res, e);'
  );

  // Unauthorized
  out = out.replace(
    /res\.status\(401\)\.json\(\{\s*success:\s*false,\s*message:\s*'Unauthorized',\s*code:\s*'UNAUTHORIZED'\s*\}\);/g,
    `sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');`
  );

  // 400 validation with msg
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'VALIDATION_ERROR'\s*\}\);/g,
    `sendFailure(res, 400, 'VALIDATION_ERROR', msg);`
  );

  // 404 with quoted message (single line)
  out = out.replace(
    /res\.status\(404\)\.json\(\{\s*success:\s*false,\s*message:\s*'((?:[^'\\]|\\.)*)',\s*code:\s*'NOT_FOUND'\s*\}\);/g,
    (_m, msg) => `sendFailure(res, 404, 'NOT_FOUND', '${msg.replace(/'/g, "\\'")}');`
  );

  // 409 CONFLICT (two-line object)
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*\r?\n\s*success:\s*false,\s*\r?\n\s*message:\s*'Record was modified by another user',\s*\r?\n\s*code:\s*'CONFLICT',\s*\r?\n\s*\}\);/g,
    `sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');`
  );

  // 409 CONFLICT single line
  out = out.replace(
    /res\.status\(409\)\.json\(\{\s*success:\s*false,\s*message:\s*'Record was modified by another user',\s*code:\s*'CONFLICT'\s*\}\);/g,
    `sendFailure(res, 409, 'CONFLICT', 'Record was modified by another user');`
  );

  // res.json({ success: true, data: <expr> });  → sendSuccess(res, <expr>);
  out = out.replace(/res\.json\(\{\s*success:\s*true,\s*data:\s*([^;]+?)\s*\}\);/g, 'sendSuccess(res, $1);');

  // res.status(201).json({ success: true, data: <expr> });
  out = out.replace(
    /res\.status\(201\)\.json\(\{\s*success:\s*true,\s*data:\s*([^;]+?)\s*\}\);/g,
    'sendSuccess(res, $1, 201);'
  );

  // Remaining 500 with msg only (if catch wasn't converted)
  out = out.replace(
    /res\.status\(500\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'SERVER_ERROR'\s*\}\);/g,
    `sendFailure(res, 500, 'SERVER_ERROR', msg);`
  );

  return out;
}

const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'));
for (const f of files) {
  const p = path.join(routesDir, f);
  const before = fs.readFileSync(p, 'utf8');
  const after = migrate(before, f);
  if (after !== before) {
    fs.writeFileSync(p, after, 'utf8');
    console.log('updated', f);
  }
}
console.log('done');
