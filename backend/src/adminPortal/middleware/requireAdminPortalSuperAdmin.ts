import type { Response, NextFunction } from 'express';
import type { AdminRequest } from './adminAuthMiddleware.js';

/** Platform admin portal — only PBooks Pro super_admin accounts may manage tenant super users. */
export function requireAdminPortalSuperAdmin() {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (req.adminRole !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only platform Super Admins can create or promote tenant Super Admins.',
      });
      return;
    }
    next();
  };
}
