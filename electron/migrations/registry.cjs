/**
 * Registered migrations: fromVersion exclusive → toVersion inclusive steps.
 * Rules: no DROP COLUMN; only additive changes (handled in migration files).
 */

const migrations = [
  // Example: require('./migration_14_to_15.cjs'),
];

/**
 * @param {import('better-sqlite3').Database} d
 * @param {number} fromV
 * @param {number} toV
 * @param {string[]} messages
 */
function runMigrations(d, fromV, toV, messages) {
  if (fromV >= toV) return;
  const sorted = [...migrations]
    .filter((m) => m && typeof m.to === 'number' && typeof m.up === 'function')
    .sort((a, b) => a.to - b.to);
  for (const mod of sorted) {
    if (fromV < mod.to && mod.to <= toV) {
      try {
        mod.up(d);
        messages.push(`Migration → v${mod.to} applied`);
      } catch (e) {
        messages.push(`Migration v${mod.to} failed: ${e && e.message}`);
        throw e;
      }
    }
  }
}

module.exports = { runMigrations, migrations };
