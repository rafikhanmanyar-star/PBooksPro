import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from '../services/databaseService.js';

export interface AdminRequest extends Record<string, any> {
  adminId?: string;
  adminRole?: 'super_admin' | 'admin';
}

export function adminAuthMiddleware() {
  return async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDatabaseService();
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No authentication token' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

      // Verify admin user exists and is active
      const admins = await db.query(
        'SELECT * FROM admin_users WHERE id = $1 AND is_active = TRUE',
        [decoded.adminId]
      );

      if (admins.length === 0) {
        return res.status(403).json({ error: 'Invalid admin credentials' });
      }

      req.adminId = decoded.adminId;
      req.adminRole = decoded.role;

      next();
    } catch (error) {
      console.error('Admin auth middleware error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

