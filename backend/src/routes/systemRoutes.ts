import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendSuccess } from '../utils/apiResponse.js';
import { buildSystemInfo } from '../services/systemFeatureService.js';

export const systemRouter = Router();

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

systemRouter.get('/system/info', (_req, res) => {
  sendSuccess(res, buildSystemInfo(getMonorepoPackageVersion()));
});
