/**
 * Session Cleanup Service
 * 
 * Periodically checks for inactive user sessions and invalidates them.
 * A session is considered inactive if last_activity is older than the threshold.
 * This handles cases where users disconnect from the internet without properly logging out.
 */

import { getDatabaseService } from './databaseService.js';

// Configuration
const INACTIVITY_THRESHOLD_MINUTES = 30; // Sessions inactive for 30 minutes will be cleaned up
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Run cleanup every 10 minutes

let cleanupInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Clean up inactive sessions
 * Sessions are considered inactive if last_activity is older than the threshold
 */
export async function cleanupInactiveSessions(): Promise<number> {
  if (isRunning) {
    console.log('⏳ Session cleanup already running, skipping...');
    return 0;
  }

  isRunning = true;
  let cleanedCount = 0;

  try {
    const db = getDatabaseService();
    
    // Check if user_sessions table exists before trying to use it
    try {
      const tableCheck = await db.query(
        `SELECT 1 FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = 'user_sessions'`
      );
      
      if (tableCheck.length === 0) {
        console.log('ℹ️  user_sessions table does not exist yet (migrations may still be running), skipping cleanup');
        return 0;
      }
    } catch (checkError) {
      console.warn('⚠️  Could not check if user_sessions table exists:', checkError);
      // Continue anyway - might work on next attempt
    }
    
    const thresholdDate = new Date();
    thresholdDate.setMinutes(thresholdDate.getMinutes() - INACTIVITY_THRESHOLD_MINUTES);

    console.log(`🧹 Starting session cleanup (threshold: ${INACTIVITY_THRESHOLD_MINUTES} minutes)`);

    // Find and delete inactive sessions
    const result = await db.query(
      `DELETE FROM user_sessions 
       WHERE last_activity < $1 
       RETURNING id, user_id, tenant_id`,
      [thresholdDate]
    );

    cleanedCount = result.length;

    if (cleanedCount > 0) {
      console.log(`✅ Cleaned up ${cleanedCount} inactive session(s)`);
      
      // Log details for debugging
      result.forEach((session: any) => {
        console.log(`   - Session ${session.id} (User: ${session.user_id}, Tenant: ${session.tenant_id})`);
      });
    } else {
      console.log('✅ No inactive sessions to clean up');
    }

    // Also clean up expired sessions (where expires_at < NOW)
    const expiredResult = await db.query(
      `DELETE FROM user_sessions 
       WHERE expires_at < NOW() 
       RETURNING id, user_id, tenant_id`
    );

    if (expiredResult.length > 0) {
      console.log(`✅ Cleaned up ${expiredResult.length} expired session(s)`);
      cleanedCount += expiredResult.length;
    }

  } catch (error: any) {
    // Handle table not found error gracefully (migrations might still be running)
    if (error?.code === '42P01' && error?.message?.includes('user_sessions')) {
      console.log('ℹ️  user_sessions table does not exist yet (migrations may still be running), skipping cleanup');
      // This is not a critical error - table will be created by migrations
      return 0;
    }
    
    console.error('❌ Error during session cleanup:', error);
    console.error('   Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code
    });
  } finally {
    isRunning = false;
  }

  return cleanedCount;
}

/**
 * Start the periodic cleanup service
 */
export function startSessionCleanupService(): void {
  if (cleanupInterval) {
    console.log('⚠️ Session cleanup service already running');
    return;
  }

  console.log(`🚀 Starting session cleanup service (interval: ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes)`);
  
  // Run cleanup immediately on startup
  cleanupInactiveSessions().catch(err => {
    console.error('❌ Initial session cleanup failed:', err);
  });

  // Then run periodically
  cleanupInterval = setInterval(() => {
    cleanupInactiveSessions().catch(err => {
      console.error('❌ Periodic session cleanup failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the periodic cleanup service
 */
export function stopSessionCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Session cleanup service stopped');
  }
}

/**
 * Check if a specific session is inactive
 * Returns true if the session should be considered inactive
 */
export async function isSessionInactive(sessionToken: string): Promise<boolean> {
  try {
    const db = getDatabaseService();
    
    // Check if user_sessions table exists
    try {
      const tableCheck = await db.query(
        `SELECT 1 FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = 'user_sessions'`
      );
      
      if (tableCheck.length === 0) {
        // Table doesn't exist - assume session is inactive (user needs to re-login)
        return true;
      }
    } catch (checkError) {
      // If we can't check, assume table doesn't exist and session is inactive
      return true;
    }
    
    const thresholdDate = new Date();
    thresholdDate.setMinutes(thresholdDate.getMinutes() - INACTIVITY_THRESHOLD_MINUTES);

    const sessions = await db.query(
      `SELECT last_activity, expires_at FROM user_sessions 
       WHERE token = $1`,
      [sessionToken]
    );

    if (sessions.length === 0) {
      return true; // Session doesn't exist, consider it inactive
    }

    const session = sessions[0] as any;
    const lastActivity = new Date(session.last_activity);
    const expiresAt = new Date(session.expires_at);
    const now = new Date();

    // Session is inactive if:
    // 1. last_activity is older than threshold, OR
    // 2. Session has expired
    return lastActivity < thresholdDate || expiresAt < now;
  } catch (error: any) {
    // Handle table not found error gracefully
    if (error?.code === '42P01' && error?.message?.includes('user_sessions')) {
      // Table doesn't exist - assume session is inactive
      return true;
    }
    
    console.error('Error checking session inactivity:', error);
    // On error, assume session is active to avoid false positives (except for missing table)
    return false;
  }
}

