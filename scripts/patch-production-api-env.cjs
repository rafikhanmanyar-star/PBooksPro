/**
 * Ensure production PBooks Pro API Server AppData .env has DISABLE_MFA_ENFORCEMENT=true.
 * Use when MFA setup fails on the installed API server (v1.2.314 client).
 *
 *   node scripts/patch-production-api-env.cjs
 *   node scripts/patch-production-api-env.cjs --show-path
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const appData =
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const configCandidates = [
  path.join(appData, 'PBooks Pro API Server', 'backend'),
  path.join(appData, 'pbooks-pro', 'backend'),
];
const configDir = configCandidates.find((p) => fs.existsSync(p)) || configCandidates[0];
const envPath = path.join(configDir, '.env');

function showPath() {
  console.log('Production API Server config folder:');
  console.log(' ', configDir);
  console.log('Env file:');
  console.log(' ', envPath);
  console.log('Exists:', fs.existsSync(envPath));
}

function upsertEnvLine(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}\\s*=`, 'm');
  if (re.test(text)) {
    return text.replace(re, line);
  }
  return `${text.trimEnd()}\n${line}\n`;
}

function main() {
  if (process.argv.includes('--show-path')) {
    showPath();
    return;
  }

  showPath();
  if (!fs.existsSync(configDir)) {
    console.error('\nERROR: Config folder not found. Open PBooks Pro API Server once, then retry.');
    process.exit(1);
  }

  let text = '';
  if (fs.existsSync(envPath)) {
    text = fs.readFileSync(envPath, 'utf8');
  } else {
    const example = path.join(configDir, '.env.example');
    if (fs.existsSync(example)) {
      text = fs.readFileSync(example, 'utf8');
    }
  }

  if (!/JWT_SECRET\s*=/m.test(text)) {
    text = upsertEnvLine(text, 'JWT_SECRET', 'change-me-to-a-long-random-string');
  }
  if (!/DATABASE_URL\s*=/m.test(text)) {
    text = upsertEnvLine(text, 'DATABASE_URL', 'postgresql://postgres:@127.0.0.1:5432/pbookspro');
  }
  if (!/PORT\s*=/m.test(text)) {
    text = upsertEnvLine(text, 'PORT', '3000');
  }

  text = upsertEnvLine(text, 'DISABLE_MFA_ENFORCEMENT', 'true');
  fs.writeFileSync(envPath, text, 'utf8');

  console.log('\nOK: Wrote DISABLE_MFA_ENFORCEMENT=true to AppData .env');
  console.log('Restart PBooks Pro API Server, then sign in again (Back to sign in → Rafi / Rafi1234).');
}

main();
