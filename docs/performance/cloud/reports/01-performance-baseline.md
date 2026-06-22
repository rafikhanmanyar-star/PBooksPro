# Performance Baseline Report (Phase 1)

**Environment:** _staging / production cloud_  
**Date:** _YYYY-MM-DD_  
**Tenant:** _name / id_  
**API version:** _from /app-info/version_  

---

## Summary

| Metric | Value |
|--------|------:|
| Total load time (login → dashboard ready) | _ms_ |
| Client API request count | _n_ |
| Server probe request count | _n_ |
| Peak pool waitingCount | _n_ |

---

## Client milestones

| Milestone | Elapsed (ms) |
|-----------|-------------:|
| app_boot | |
| auth_check_start | |
| auth_check_done | |
| login_submit | |
| login_success | |
| bootstrap_start | |
| bootstrap_complete | |
| dashboard_ready | |

_Source: `window.__PBOOKS_EXPORT_STARTUP_PERF__()` with `PBOOKS_STARTUP_PERF=1`_

---

## Server probe (slowest endpoints)

| Phase | Endpoint | p50 ms | p95 ms | Payload |
|-------|----------|-------:|-------:|--------:|
| | | | | |

_Source: `npm run perf:cloud:baseline` → `docs/performance/cloud/captures/phase1-baseline.json`_

---

## Pool snapshot

| | Before burst | After burst |
|---|--:|--:|
| activeCount | | |
| idleCount | | |
| waitingCount | | |
| saturated | | |

---

## Observations

_Document anomalies, Cloudflare 524/503, retry storms, etc._

---

## Sign-off

- [ ] Baseline captured on representative tenant
- [ ] Ready for Phase 2 startup matrix
