/**
 * Reset public demo tenant from version-controlled template.
 * Cron: 0 3 * * * curl -X POST -H "x-demo-reset-secret: $DEMO_RESET_SECRET" https://api.example.com/api/demo/reset
 * Or: npm run demo:reset --prefix backend
 */
import '../loadEnv.js';
import { resetPublicDemoTenant } from '../services/demo/demoResetService.js';
import { logger } from '../utils/logger.js';

async function main() {
  const result = await resetPublicDemoTenant();
  logger.info('Demo reset CLI complete', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
