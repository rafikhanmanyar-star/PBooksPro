/**
 * Generates a deployment build version and version.json payload.
 * Used by Vite closeBundle and standalone prebuild scripts.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * @returns {{ version: string, buildTime: string, packageVersion: string }}
 */
export function generateBuildVersionMeta() {
  const now = new Date();
  const buildTime = now.toISOString();
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())}`;

  // Prefer Render commit for reproducible deploy IDs; fall back to time-of-day sequence.
  const renderCommit = process.env.RENDER_GIT_COMMIT?.trim();
  const sequence =
    renderCommit?.slice(0, 7) ||
    process.env.BUILD_NUMBER?.trim() ||
    pad(now.getUTCHours() * 60 + now.getUTCMinutes());

  const version = `${datePart}.${sequence}`;
  const packageVersion = readPackageVersion();

  return { version, buildTime, packageVersion };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  console.log(JSON.stringify(generateBuildVersionMeta(), null, 2));
}
