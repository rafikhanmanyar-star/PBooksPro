/**
 * RBAC V2 startup diagnostics — instrumentation only; does not change authorization behavior.
 */
import { getEnvLoadDiagnostics } from '../loadEnv.js';
import { logger } from '../utils/logger.js';

function envFlag(value: string | undefined): string | null {
  return value ?? null;
}

/** Log RBAC feature flags and env-file sources once during API startup. */
export function logRbacDebugStartup(): void {
  logger.info('[RBAC_DEBUG] Startup Flags', {
    roleManagement: envFlag(process.env.RBAC_V2_ROLE_MANAGEMENT),
    breakGlass: envFlag(process.env.RBAC_V2_BREAK_GLASS),
    sod: envFlag(process.env.RBAC_V2_SOD),
    authorizationEngine: envFlag(process.env.RBAC_V2_AUTHORIZATION_ENGINE),
    dataScope: envFlag(process.env.RBAC_V2_DATA_SCOPE),
    approvalMatrix: envFlag(process.env.RBAC_V2_APPROVAL_MATRIX),
  });

  const loadEnvFiles = getEnvLoadDiagnostics().map((entry) => ({
    path: entry.path,
    exists: entry.exists,
    keysMerged: entry.keysMerged,
  }));

  logger.info('[RBAC_DEBUG] Environment file load', {
    nodeEnv: process.env.NODE_ENV ?? null,
    dotenvConfigPath: process.env.DOTENV_CONFIG_PATH ?? null,
    loadEnvFiles,
    note:
      'Vars may also be preloaded by dotenv-cli (-e .env.staging) or the shell before loadEnv.ts runs.',
  });
}
