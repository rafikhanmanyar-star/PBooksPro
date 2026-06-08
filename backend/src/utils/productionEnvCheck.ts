import { getJwtSecret } from '../auth/jwt.js';
import { logger } from './logger.js';
import { validatePassword } from './passwordPolicy.js';

/** Fail fast on unsafe production configuration before accepting traffic. */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  try {
    getJwtSecret();
  } catch (e) {
    logger.error('Production startup blocked: JWT_SECRET is missing or too short');
    throw e;
  }

  if (process.env.SEED_STAGING === '1' && process.env.ALLOW_STAGING_SEED_IN_PRODUCTION !== 'true') {
    throw new Error(
      'SEED_STAGING=1 is not allowed in production without ALLOW_STAGING_SEED_IN_PRODUCTION=true'
    );
  }

  if (process.env.PADDLE_API_KEY?.trim() && !process.env.PADDLE_WEBHOOK_SECRET?.trim()) {
    throw new Error(
      'PADDLE_WEBHOOK_SECRET is required in production when PADDLE_API_KEY is set.'
    );
  }

  if (process.env.SEED_STAGING === '1') {
    const pwd = process.env.STAGING_ADMIN_PASSWORD;
    if (pwd) {
      const policyError = validatePassword(pwd);
      if (policyError) {
        throw new Error(`STAGING_ADMIN_PASSWORD does not meet policy: ${policyError}`);
      }
    } else {
      logger.warn('Production staging seed: set STAGING_ADMIN_PASSWORD to a strong password (8+ chars, letter and number)');
    }
  }
}
