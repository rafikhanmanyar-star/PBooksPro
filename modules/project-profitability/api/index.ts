/**
 * Client-side profitability analytics — no separate HTTP layer in local/Electron mode.
 * A future PostgreSQL API can mirror these payloads under `/api/project-profitability/*`.
 */

export type { PortfolioProfitabilitySummary, ProjectProfitabilityRow } from '../types/profitability.types';
