import React from 'react';

/** Offline SQLite database inspector — retired in PostgreSQL-only mode. */
const DatabaseAnalyzer: React.FC = () => (
  <p className="text-sm text-app-muted">
    Local SQLite inspection is not available. Data is stored in PostgreSQL and managed via Settings → Backup &amp; Restore.
  </p>
);

export default DatabaseAnalyzer;
