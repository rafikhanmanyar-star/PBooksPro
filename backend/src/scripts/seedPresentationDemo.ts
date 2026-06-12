/**
 * Seed the in-person presentation org (demo@company.com / demo-company).
 * Persistent sample data — not reset on login/logout or public sandbox cron.
 *
 *   npm run demo:seed-presentation --prefix backend
 *   npm run demo:seed-presentation --prefix backend -- --production
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const useProduction = process.argv.includes('--production');
if (useProduction) {
  const productionEnv = path.join(root, '.env.production.render');
  const fallbackEnv = path.join(root, '.env.production');
  if (fs.existsSync(productionEnv)) {
    dotenv.config({ path: productionEnv, override: true });
  } else if (fs.existsSync(fallbackEnv)) {
    dotenv.config({ path: fallbackEnv, override: true });
  } else {
    console.error('Missing .env.production.render or .env.production for --production');
    process.exit(1);
  }
} else {
  for (const envFile of ['.env', '.env.staging']) {
    const p = path.join(root, envFile);
    if (fs.existsSync(p)) dotenv.config({ path: p });
  }
}
await import('../loadEnv.js');

import { seedPresentationDemoOrg } from '../services/demo/demoPresentationService.js';
import { logger } from '../utils/logger.js';

async function main() {
  const skipReseed = process.argv.includes('--skip-reseed');
  const result = await seedPresentationDemoOrg({ reseed: !skipReseed });
  logger.info('Presentation demo seed complete', result);
  console.log('');
  console.log('In-person demo org ready:');
  console.log(`  Organization: ${result.tenantId} (${result.email})`);
  console.log(`  Login email:  ${result.email}`);
  console.log(`  Username:     ${result.username}`);
  console.log(`  Password:     (DEMO_PRESENTATION_PASSWORD or DEMO_USER_PASSWORD or Demo@2024!)`);
  console.log(`  Reseeded:     ${result.reseeded}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
