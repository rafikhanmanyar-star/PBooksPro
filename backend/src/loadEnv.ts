/**
 * Load env files predictably when the API is started from the monorepo root (`npm run dev:backend`)
 * or from `backend/`. Default `dotenv/config` only reads `.env` from `process.cwd()`, so `backend/.env`
 * was often ignored.
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** `backend/.env` — primary config for the API server */
config({ path: join(__dirname, '..', '.env') });

/** Optional monorepo root `.env` — fills vars not set in backend/.env (does not override) */
config({ path: join(__dirname, '..', '..', '.env') });
