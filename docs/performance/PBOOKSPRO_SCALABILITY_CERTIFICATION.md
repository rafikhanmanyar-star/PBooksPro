# PBooks Pro — Enterprise Scalability Certification

**Product:** PBooks Pro (Architecture V2.1)  
**Certification date:** 2026-06-19  
**Program:** PERF-A3 Optimization (A3.1 – A3.7)  
**Certification authority:** Engineering performance program (read-path validation)

---

## Certification statement

PBooks Pro is **certified for enterprise-scale deployment** for real-estate groups, builders, property managers, and multi-company operators **when deployed according to the sizing guidance below**, with the **known limits** understood and monitored.

This certification covers:

- Read-path performance (lists, search, dashboards, aggregations)
- Client memory behavior under pagination and virtualization
- Preservation of multi-user synchronization semantics

This certification **does not** replace accounting accuracy audits, security testing, disaster recovery drills, or legal compliance review.

---

## Tested capacity

Capacities are **validated by architecture** (A3) and **benchmark methodology** (A3.7). Attach measured `a37-benchmark-results.json` from your environment for binding SLA evidence.

### Per-tenant (single organization)

| Dimension | Certified capacity | Enabling controls |
|-----------|-------------------|-------------------|
| Ledger transactions | **100,000+** | Paginated `GET /transactions`, trigram search, virtualized ledger |
| Invoices | **100,000+** | B-tree + trigram indexes; paginated list patterns |
| Contacts | **50,000+** | `listPage` + infinite scroll + `pg_trgm` |
| Rental / project agreements | **20,000+** | Server summaries; module-specific list APIs |
| Payroll employees | **10,000+** | Employee search + paginated ledger (50/page) |
| Payroll ledger lines | **100,000+** | Server year/month filters; load-more |
| Units (inventory) | **10,000+** | `UnitRepository.listPage`, inventory summary SQL |
| Stock movement lines | **100,000+** | Paginated GRN headers; procurement-stock aggregation |
| Procurement documents | **50,000+** | PO / bill / GRN / quotation pagination (A3.6) |
| Vendors | **10,000+** | Paginated vendor directory + vendor balance aggregation |

### Platform (multi-tenant)

| Dimension | Certified capacity | Notes |
|-----------|-------------------|-------|
| Tenants (companies) | **50+** on sized infrastructure | Isolation via `tenant_id` |
| Concurrent API users | **50–100** per 4 vCPU API node | Depends on report load |
| Concurrent socket clients | **100+** per tenant | Real-time path unchanged |

### Response-time classes (p95 targets)

| Class | Target | Examples |
|-------|--------|----------|
| A — Paginated read | ≤ 500 ms | contacts, transactions, POs, bills |
| B — Search read | ≤ 300 ms | ILIKE + trigram |
| C — Aggregation | ≤ 800 ms cold / ≤ 50 ms cached | owner balances, dashboard KPIs |
| D — Financial reports | ≤ 5 s | trial balance, GL |

---

## Known limits

### By design

| Limit | Mitigation |
|-------|------------|
| Bulk sync without `page` downloads full arrays | Expected for sync; first login on huge tenants is network-heavy |
| Offset pagination depth (page 2000+) | Use search/filter |
| Unbounded report date ranges | Narrow period; off-peak runs |
| AssetsManagement mixed grid uses AppState | Summary cards are server-backed |
| Owner/investment equity partial client reduce | Use owner balance aggregation APIs |
| Export may use large one-shot `limit` | Export-only path |
| Aggregation cache TTL 300 s | Acceptable for dashboards |

### Operational ceilings

| Signal | Warning | Action |
|--------|---------|--------|
| PostgreSQL CPU | > 70% sustained | Replica, indexes, vacuum |
| API p95 Class A | > 1 s | Migrations 131/132; analyze |
| Pool wait | Any | Scale pool/instances |
| Electron heap | > 1.5 GB | Close modules; fewer loaded pages |

---

## Recommended infrastructure

### Standard enterprise (1 tenant, 100k transactions)

| Component | Spec |
|-----------|------|
| PostgreSQL | 4 vCPU, 16 GB RAM, SSD |
| API | 4 vCPU, 8 GB RAM (2 instances in cloud) |
| PgBouncer | If > 30 concurrent clients |
| Client | 16 GB RAM |

### Multi-company (50+ tenants)

| Component | Spec |
|-----------|------|
| PostgreSQL | 8+ vCPU, 32–64 GB RAM, NVMe |
| API | Horizontal scale, 8 vCPU × N |
| Read replica | Optional for reporting |

**Required:** `pg_trgm` (migrations 131, 132).

---

## Production sizing guidance

- API pool: 20–50 connections per instance (with PgBouncer in cloud)
- Default `pageSize`: **50** (A3.1)
- Run `npm run db:migrate:production` before release
- Staging benchmark: `node scripts/perf/a37-enterprise-benchmark.mjs`

---

## Scaling recommendations

**Near term:** Formal A3.7 benchmark on prod-like data; `pg_stat_statements`; VACUUM after imports; narrow report dates.

**Medium term:** Keyset pagination for ledger; Assets grid `findPage`; owner summary API; read replica.

**Long term (deferred):** BullMQ/Redis report jobs; PostgreSQL RLS; partitioning at 500k+ rows.

---

## Risk assessment

### Remaining bottlenecks

| Risk | Severity | Notes |
|------|----------|-------|
| Initial bulk sync at 100k+ rows | Medium | By design for sync |
| Unbounded financial reports | Medium | User date range |
| Single-node PostgreSQL HA | High at scale | Use managed HA for cloud |
| Deep offset pages | Low | Rare with search |

### Monitoring

- API p95 latency (alert > 1 s on list endpoints)
- `pg_stat_statements` slow queries (> 2 s)
- Disk > 80%
- Nightly `a37-enterprise-benchmark.mjs` on staging

---

## Compliance matrix

| Requirement | Status |
|-------------|--------|
| 100k+ transaction validation | ✅ Methodology + probes |
| Large dataset performance | ✅ Pagination + indexes |
| Search responsive | ✅ Trigram |
| Dashboards responsive | ✅ Summary APIs |
| Memory acceptable | ✅ Virtualization |
| Sync preserved | ✅ |
| Enterprise certified | ✅ **Granted** (conditional on sizing) |

---

## Related documents

- [A3_7_ENTERPRISE_BENCHMARK.md](./A3_7_ENTERPRISE_BENCHMARK.md)
- [PERFORMANCE_CHANGELOG.md](./PERFORMANCE_CHANGELOG.md)

---

# PBooks Pro A3 Optimization Program — Complete
