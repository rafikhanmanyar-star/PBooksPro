/**
 * Resolve esbuild from backend/node_modules (Render) or repo root (local dev).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function loadEsbuild() {
  for (const pkgJson of [
    path.join(root, 'backend', 'package.json'),
    path.join(root, 'package.json'),
  ]) {
    try {
      return createRequire(pkgJson)('esbuild');
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'esbuild is required for backend build. Run: npm install --prefix backend --include=dev'
  );
}

export default loadEsbuild();
