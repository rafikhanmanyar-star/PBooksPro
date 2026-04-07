/**
 * GET stubs for entity lists not yet implemented in this lightweight API.
 * Returns { success: true, data: [] } so the web client loadState() can complete
 * without 404/HTML errors during local dev (npm run dev:backend).
 */
import { Router, type Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { sendFailure, sendSuccess } from '../utils/apiResponse.js';

export const entityListStubsRouter = Router();

const emptyList = (_req: AuthedRequest, res: Response) => {
  sendSuccess(res, []);
};

const notFound = (_req: AuthedRequest, res: Response) => {
  sendFailure(res, 404, 'NOT_FOUND', 'Not found');
};

/** Collection GET paths — keep in sync with services/api/repositories/*Api.ts findAll() */
const LIST_PATHS = [
  'quotations',
  'documents',
  'transaction-audit',
] as const;

for (const p of LIST_PATHS) {
  entityListStubsRouter.get(`/${p}`, emptyList);
  entityListStubsRouter.get(`/${p}/:id`, notFound);
}
