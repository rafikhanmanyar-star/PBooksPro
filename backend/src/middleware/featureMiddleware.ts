import type { Response, NextFunction } from 'express';
import { sendFailure } from '../utils/apiResponse.js';
import {
  getAppEdition,
  isFeatureEnabled,
  type SystemFeatureKey,
} from '../services/systemFeatureService.js';

const CLOUD_FEATURE_MESSAGE = 'Feature unavailable in Cloud Edition';

export function requireFeature(feature: SystemFeatureKey) {
  return (_req: unknown, res: Response, next: NextFunction): void => {
    if (!isFeatureEnabled(feature)) {
      sendFailure(res, 403, 'FORBIDDEN', CLOUD_FEATURE_MESSAGE, {
        message: CLOUD_FEATURE_MESSAGE,
        edition: getAppEdition(),
        feature,
      });
      return;
    }
    next();
  };
}

export function requireDesktopEdition() {
  return requireFeature('applicationUpdates');
}
