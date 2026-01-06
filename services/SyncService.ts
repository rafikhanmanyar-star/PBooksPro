/**
 * @deprecated This service is no longer used.
 * 
 * PeerJS-based peer-to-peer synchronization has been replaced with
 * Socket.IO-based real-time synchronization through the backend API.
 * 
 * Real-time sync is now handled via:
 * - Backend Socket.IO server with tenant-specific rooms
 * - JWT authentication for secure connections
 * - Automatic tenant isolation
 * 
 * This file is kept for reference but should not be imported or used.
 */

// This file is intentionally left mostly empty as the functionality has been removed.
// The previous PeerJS implementation has been replaced with Socket.IO-based sync.

export const syncService = {
    // Placeholder to prevent import errors
    init: () => {},
    subscribe: () => () => {},
    disconnect: () => {},
    broadcastAction: () => {},
    startHosting: async () => '',
    joinSession: async () => {},
};
