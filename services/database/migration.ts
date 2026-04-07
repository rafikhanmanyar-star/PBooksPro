/**
 * Legacy localStorage → SQLite migration hooks.
 * Current Electron builds initialize SQLite directly; migration is a no-op unless extended.
 */

export function needsMigration(): boolean {
    return false;
}

export async function runAllMigrations(
    _onProgress?: (progress: number, message: string) => void
): Promise<{
    success: boolean;
    migrated?: boolean;
    error?: string;
    recordCounts?: Record<string, number>;
}> {
    return { success: true, migrated: false, recordCounts: {} };
}
