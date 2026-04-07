/**
 * One-time migration: normalize backend route JSON to { success, data, error }.
 * Run: node scripts/migrate-backend-api-envelope.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesDir = join(__dirname, '..', 'backend', 'src', 'routes');

const IMPORT_LINE = `import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';\n`;

function migrateContent(name, src) {
  let out = src;
  if (!out.includes("from '../utils/apiResponse.js'")) {
    const nl = out.startsWith('\ufeff') ? '\ufeff' : '';
    const body = nl ? out.slice(1) : out;
    const firstImport = body.indexOf('import ');
    if (firstImport === -1) return out;
    const lineEnd = body.indexOf('\n', firstImport);
    out = nl + body.slice(0, lineEnd + 1) + IMPORT_LINE + body.slice(lineEnd + 1);
  }

  // Unauthorized (exact)
  out = out.replace(
    /res\.status\(401\)\.json\(\{\s*success:\s*false,\s*message:\s*'Unauthorized',\s*code:\s*'UNAUTHORIZED'\s*\}\);/g,
    `sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');`
  );

  // 500 + SERVER_ERROR with msg variable
  out = out.replace(
    /res\.status\(500\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'SERVER_ERROR'\s*\}\);/g,
    `handleRouteError(res, e);`
  );

  // Note: the above replaces `msg` blocks — catch must use `(e)` not other names.
  // Fix if catch uses different variable: manual review required.

  // 400 validation with msg
  out = out.replace(
    /res\.status\(400\)\.json\(\{\s*success:\s*false,\s*message:\s*msg,\s*code:\s*'VALIDATION_ERROR'\s*\}\);/g,
    `sendFailure(res, 400, 'VALIDATION_ERROR', msg);`
  );

  // 404 not found (common)
  out = out.replace(
    /res\.status\(404\)\.json\(\{\s*success:\s*false,\s*message:\s*'([^']+)',\s*code:\s*'NOT_FOUND'\s*\}\);/g,
    (_m, msg) => `sendFailure(res, 404, 'NOT_FOUND', '${msg.replace(/'/g, "\\'")}');`
  );

  // 403 patterns from authRoutes
  out = out.replace(
    /res\.status\(403\)\.json\(\{\s*success:\s*false,\s*message:\s*([^,]+),\s*code:\s*'FORBIDDEN'\s*\}\);/g,
    (_m, msg) => `sendFailure(res, 403, 'FORBIDDEN', ${msg.trim()});`
  );

  return out;
}

const files = readdirSync(routesDir).filter((f) => f.endsWith('.ts'));
for (const f of files) {
  const path = join(routesDir, f);
  let src = readFileSync(path, 'utf8');
  const next = migrateContent(f, src);
  if (next !== src) {
    writeFileSync(path, next, 'utf8');
    console.log('updated', f);
  }
}

console.log('done');
