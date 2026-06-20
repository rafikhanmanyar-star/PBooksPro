/**
 * A5.1.6C — RBAC V2 feature routers must not gate legacy ERP routes when flags are off.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import { dataScopeRouter } from '../modules/rbac/routes/dataScopeRoutes.js';
import { approvalMatrixRouter } from '../modules/rbac/routes/approvalMatrixRoutes.js';
import { sendSuccess } from '../utils/apiResponse.js';

const routesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const mountSource = readFileSync(path.join(routesDir, 'mountVersionedApi.ts'), 'utf8');

const PREFIX = '/api/v1';
const ENV_KEYS = [
  'RBAC_V2_DATA_SCOPE',
  'RBAC_V2_APPROVAL_MATRIX',
  'RBAC_V2_AUTHORIZATION_ENGINE',
] as const;

type EnvSnapshot = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return {
    RBAC_V2_DATA_SCOPE: process.env.RBAC_V2_DATA_SCOPE,
    RBAC_V2_APPROVAL_MATRIX: process.env.RBAC_V2_APPROVAL_MATRIX,
    RBAC_V2_AUTHORIZATION_ENGINE: process.env.RBAC_V2_AUTHORIZATION_ENGINE,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function mockAuth(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { tenantId?: string; userId?: string }).tenantId = 'tenant-1';
  (req as Request & { tenantId?: string; userId?: string }).userId = 'user-1';
  next();
}

async function requestJson(
  app: express.Express,
  method: string,
  urlPath: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to bind test server');
    }
    const port = address.port;

    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: urlPath,
          method,
          headers: { Accept: 'application/json' },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            let body: Record<string, unknown> = {};
            if (raw.length > 0) {
              try {
                body = JSON.parse(raw) as Record<string, unknown>;
              } catch {
                body = { raw };
              }
            }
            resolve({ status: res.statusCode ?? 0, body });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function buildPilotApp(): express.Express {
  const app = express();
  app.use(express.json());

  const erpRouter = express.Router();
  erpRouter.get('/accounts', (_req, res) => {
    sendSuccess(res, []);
  });

  app.use(`${PREFIX}/rbac/scopes`, mockAuth, dataScopeRouter);
  app.use(`${PREFIX}/rbac/approval-matrix`, mockAuth, approvalMatrixRouter);
  app.use(PREFIX, mockAuth, erpRouter);

  return app;
}

function errorCode(body: Record<string, unknown>): string | undefined {
  const error = body.error;
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

describe('mountVersionedApi — RBAC feature router prefixes (A5.1.6C hotfix)', () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    envBefore = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envBefore);
  });

  it('mounts dataScopeRouter on /rbac/scopes, not global /api/v1', () => {
    assert.match(mountSource, /app\.use\(\s*`\$\{prefix\}\/rbac\/scopes`/);
    assert.doesNotMatch(
      mountSource,
      /app\.use\(prefix,\s*authMiddleware,\s*requireActiveSubscription\(\),\s*dataScopeRouter\)/
    );
  });

  it('mounts approvalMatrixRouter on /rbac/approval-matrix, not global /api/v1', () => {
    assert.match(mountSource, /app\.use\(\s*`\$\{prefix\}\/rbac\/approval-matrix`/);
    assert.doesNotMatch(
      mountSource,
      /app\.use\(prefix,\s*authMiddleware,\s*requireActiveSubscription\(\),\s*approvalMatrixRouter\)/
    );
  });

  it('DATA_SCOPE=false — GET /accounts does not return FEATURE_DISABLED', async () => {
    process.env.RBAC_V2_DATA_SCOPE = 'false';
    process.env.RBAC_V2_APPROVAL_MATRIX = 'false';
    process.env.RBAC_V2_AUTHORIZATION_ENGINE = 'false';

    const app = buildPilotApp();
    const { status, body } = await requestJson(app, 'GET', `${PREFIX}/accounts`);

    assert.notEqual(errorCode(body), 'FEATURE_DISABLED');
    assert.equal(status, 200);
    assert.equal(body.success, true);
  });

  it('APPROVAL_MATRIX=false — GET /accounts does not return FEATURE_DISABLED', async () => {
    process.env.RBAC_V2_DATA_SCOPE = 'false';
    process.env.RBAC_V2_APPROVAL_MATRIX = 'false';
    process.env.RBAC_V2_AUTHORIZATION_ENGINE = 'false';

    const app = buildPilotApp();
    const { status, body } = await requestJson(app, 'GET', `${PREFIX}/accounts`);

    assert.notEqual(errorCode(body), 'FEATURE_DISABLED');
    assert.equal(status, 200);
  });

  it('DATA_SCOPE=false — scope admin endpoint returns FEATURE_DISABLED', async () => {
    process.env.RBAC_V2_DATA_SCOPE = 'false';
    process.env.RBAC_V2_AUTHORIZATION_ENGINE = 'false';

    const app = buildPilotApp();
    const { status, body } = await requestJson(
      app,
      'GET',
      `${PREFIX}/rbac/scopes/users/user-1`
    );

    assert.equal(status, 503);
    assert.equal(errorCode(body), 'FEATURE_DISABLED');
  });

  it('APPROVAL_MATRIX=false — approval-matrix endpoint returns FEATURE_DISABLED', async () => {
    process.env.RBAC_V2_APPROVAL_MATRIX = 'false';
    process.env.RBAC_V2_AUTHORIZATION_ENGINE = 'false';

    const app = buildPilotApp();
    const { status, body } = await requestJson(app, 'GET', `${PREFIX}/rbac/approval-matrix`);

    assert.equal(status, 503);
    assert.equal(errorCode(body), 'FEATURE_DISABLED');
  });
});
