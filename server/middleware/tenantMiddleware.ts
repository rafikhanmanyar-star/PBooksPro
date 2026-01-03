import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

export interface TenantRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}

export function tenantMiddleware(pool: Pool) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'No authentication token' });
      }

      // Decode JWT to get tenant_id and user_id
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.tenantId = decoded.tenantId;
      req.userId = decoded.userId;
      req.userRole = decoded.role;

      if (!req.tenantId) {
        return res.status(403).json({ error: 'No tenant context' });
      }

      // Verify tenant exists and is active
      const tenants = await pool.query(
        'SELECT * FROM tenants WHERE id = $1',
        [req.tenantId]
      );

      if (tenants.rows.length === 0) {
        return res.status(403).json({ error: 'Invalid tenant' });
      }

      // Set tenant context for RLS (Row Level Security)
      // This ensures all queries are automatically filtered by tenant_id
      await pool.query(`SET app.current_tenant_id = $1`, [req.tenantId]);

      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

