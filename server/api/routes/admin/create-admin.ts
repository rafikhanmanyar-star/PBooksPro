/**
 * Temporary endpoint to create admin user
 * REMOVE THIS AFTER CREATING THE ADMIN USER FOR SECURITY
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();

// Temporary endpoint to create admin user
// SECURITY: Remove this route after creating the admin user
// Note: This is mounted at /create-admin, so use '/' here
router.post('/', async (req, res) => {
  try {
    const db = getDatabaseService();
    
    // Check if admin already exists
    const existing = await db.query(
      'SELECT id FROM admin_users WHERE username = $1',
      ['Admin']
    );
    
    // Always generate fresh password hash
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Create or update admin user (always update password to ensure it's correct)
    await db.query(
      `INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (username) DO UPDATE 
       SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW()`,
      ['admin_1', 'Admin', 'Super Admin', 'admin@pbookspro.com', hashedPassword, 'super_admin', true]
    );
    
    res.json({ 
      success: true, 
      message: 'Admin user created successfully',
      username: 'Admin',
      password: 'admin123',
      warning: 'REMOVE THIS ENDPOINT AFTER USE FOR SECURITY'
    });
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to create admin user' });
  }
});

export default router;

