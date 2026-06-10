import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireFeature } from '../middleware/featureMiddleware.js';

export const appUpdateRouter = Router();

function getMonorepoPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const rootPkg = join(here, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Desktop edition only — cloud returns 403. */
appUpdateRouter.get('/app-updates/check', requireFeature('applicationUpdates'), (_req, res) => {
  sendSuccess(res, {
    currentVersion: getMonorepoPackageVersion(),
    environment: process.env.NODE_ENV || 'development',
    updatesManagedBy: 'desktop-installer',
  });
});

appUpdateRouter.post('/app-updates/check', requireFeature('applicationUpdates'), (_req, res) => {
  sendSuccess(res, {
    updateAvailable: false,
    currentVersion: getMonorepoPackageVersion(),
  });
});
