/**
 * Seed staging defaults (test company + Rafi / Rafi1234).
 * Run: npm run db:seed:staging  (from repo root, loads .env.staging)
 */
import { seedStagingDefaults } from '../seed.js';

seedStagingDefaults()
  .then(() => {
    console.log('Staging defaults seeded.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
