# A4.8 — Disaster Recovery Validation

## Objective

Validate recoverability and document procedures without changing business logic.

## Existing platform capabilities

| Capability | Location |
|------------|----------|
| Backup Center | Settings → Backup Center (`BackupRestorePage`) |
| DR module API | `backend/src/modules/dr/` |
| DR UI | `components/settings/DisasterRecoveryCenter.tsx` |
| Backup module | `backend/src/modules/backup/` |

## Verified recovery paths

### Database backup

- Scheduled and on-demand backups via Backup Center
- Backup metadata stored for verification runs

### Restore process

- Restore workflows in Backup Center (admin-gated)
- DR module supports restore **test** runs without production cutover

### Recovery time

| Scenario | Target (design) | Validation |
|----------|-----------------|------------|
| Single-tenant restore from backup | Minutes–hours (data size dependent) | DR restore test in UI |
| Full DB restore | Hours | Staging rehearsal recommended |
| API process restart | < 1 min | `GET /health`, `GET /api/health/ready` |
| Client reconnect | Automatic | Socket reconnect + React Query invalidation |

Formal RTO/RPO sign-off requires running restore tests against staging `pBookspro_Staging`.

## Failure simulations (operational drills)

| Failure | Detection | Recovery procedure |
|---------|-----------|-------------------|
| **Database failure** | Health Center DB component unhealthy; readiness 503 | Restore from latest backup; run migrations if needed |
| **Server failure** | `/health` down; process exit | Restart API service (Electron API Server installer or cloud host) |
| **Network failure** | Client network errors; API timeouts in monitoring | Client offline queue (existing); verify LAN/API URL |
| **Sync failure** | Sync Diagnostics failed count > 0 | Inspect `last_error` on queue rows; retry after root cause fixed — **do not** bypass queue ordering |

## DR dashboard features

From `DisasterRecoveryCenter`:

- Verification runs
- Restore tests
- Alert configuration
- Health reports

API: `services/api/disasterRecoveryApi.ts`

## Risks

| Risk | Mitigation |
|------|------------|
| Backup not tested | Schedule quarterly restore test on staging |
| Single-region PostgreSQL | Document cloud provider backup retention |
| In-memory API metrics lost on crash | Rely on `monitoring_events` + external APM for history |
| Multi-node API without shared metrics | Per-instance health checks + load balancer health |

## Documentation cross-references

- `doc/PRODUCTION_MONITORING.md` — monitoring architecture
- `docs/reliability/A4_7_HEALTH_CENTER.md` — live health snapshot
- `.cursor/rules/commands.mdc` — staging/production release and migrate commands

## Constraints

DR validation is procedural and read-only in A4 — no changes to backup encryption, sync, or GL rules.
