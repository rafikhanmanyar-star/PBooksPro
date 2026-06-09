/**
 * Reset public demo tenant from version-controlled template.
 *
 * Cron: curl -X POST -H "x-demo-reset-secret: $DEMO_RESET_SECRET" https://api.pbookspro.com/api/demo/reset
 *
 * Local / production DB:
 *   npm run demo:reset --prefix backend
 *
 * Uses `.env.production.render` at repo root when present (Render production DATABASE_URL).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const productionEnv = path.join(root, '.env.production.render');
if (fs.existsSync(productionEnv)) {
  dotenv.config({ path: productionEnv });
}
import '../loadEnv.js';

import { provisionDemoEnvironment, resetPublicDemoTenant } from '../services/demo/demoResetService.js';
import { logger } from '../utils/logger.js';

async function main() {
  const provision = process.argv.includes('--provision');
  const result = provision ? await provisionDemoEnvironment() : await resetPublicDemoTenant();
  logger.info(provision ? 'Demo provision CLI complete' : 'Demo reset CLI complete', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
