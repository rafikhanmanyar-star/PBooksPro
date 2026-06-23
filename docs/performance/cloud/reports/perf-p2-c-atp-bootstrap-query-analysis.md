# PERF-P2-C — ATP Bootstrap Query Duration Analysis

**Date:** 2026-06-23  
**Program:** PERF-P2-C (measurement only — no query/index/concurrency changes)  
**Capture:** `docs/performance/cloud/captures/perf-p2-c-atp-bootstrap-query-analysis.json`

---

## Data scope & limitations

- Using **RK Builders** (`rk-builders-284d6d`, ~5k transactions) as **ATP-scale volume proxy** — largest tenant on accessible DB; ATP org on Render DB is empty.
- Measurements run via **local API → DB** (`.env.production`); production Render adds network latency and multi-user overlap not fully replicated here.

**Tenant measured:** `rk-builders-284d6d` (RK Builders)  
**Database env:** `.env.production`  
**Iterations:** 5 (warm iterations used for entity breakdown where noted)

---

## Section 1 — Slowest Bootstrap Queries

Stages ranked by **P95 duration** (ms):

| Stage | Avg | P95 | Max |
|-------|----:|----:|----:|
| authMiddleware | 0 | 1 | 1 |
| countTenantTransactions | 3 | 7 | 7 |
| entityLoaderTotal | 114 | 132 | 132 |
| fetchPlSubTypesForTenant | 5 | 7 | 7 |
| listTransactions | 19 | 28 | 28 |
| overallRequest | 154 | 175 | 175 |

### Top 10 slowest entity loaders (single-run peak / iteration max)

| Rank | Entity | Rows | Duration ms (max iter) | Avg ms | P95 ms |
|-----:|--------|-----:|-----------------------:|-------:|-------:|
| 1 | invoices | 1602 | 42 | 32 | 42 |
| 2 | accounts | 32 | 20 | 14 | 20 |
| 3 | projectAgreements | 124 | 20 | 14 | 20 |
| 4 | bills | 233 | 19 | 13 | 19 |
| 5 | rentalAgreements | 115 | 15 | 12 | 15 |
| 6 | contracts | 8 | 14 | 11 | 14 |
| 7 | units | 137 | 13 | 8 | 13 |
| 8 | installmentPlans | 0 | 13 | 8 | 13 |
| 9 | projectReceivedAssets | 0 | 13 | 7 | 13 |
| 10 | salesReturns | 0 | 13 | 8 | 13 |

---

## Section 2 — Connection Hold Analysis

| Metric | Value |
|--------|------:|
| Connection cycles (bulk route) | 89 |
| Peak simultaneous holds | 13 |
| Sum of hold times (ms) | 699 |
| Longest single hold (ms) | 43 |

### Stage duration vs connection occupancy

| Stage | Duration ms (avg) |
|-------|------------------:|
| authMiddleware (est.) | 1 |
| countTenantTransactions | 7 |
| entity loaders (aggregate) | 87 |
| fetchPlSubTypesForTenant | 5 |
| listTransactions | 15 |

### Pool occupancy timeline (first request, relative ms)

```
Bootstrap Start (t+0)
t+0ms  Connection A acquired (hold 21ms, wait 0ms)
t+21ms  Connection A released
t+23ms  Connection B acquired (hold 4ms, wait 1ms)
t+27ms  Connection B released
t+30ms  Connection C acquired (hold 43ms, wait 1ms)
t+73ms  Connection C released
t+32ms  Connection D acquired (hold 40ms, wait 1ms)
t+72ms  Connection D released
t+33ms  Connection E acquired (hold 41ms, wait 0ms)
t+74ms  Connection E released
t+64ms  Connection F acquired (hold 11ms, wait 2ms)
t+75ms  Connection F released
t+73ms  Connection G acquired (hold 3ms, wait 8ms)
t+76ms  Connection G released
t+83ms  Connection H acquired (hold 5ms, wait 0ms)
t+88ms  Connection H released
t+85ms  Connection I acquired (hold 5ms, wait 0ms)
t+90ms  Connection I released
t+86ms  Connection J acquired (hold 7ms, wait 0ms)
t+93ms  Connection J released
t+88ms  Connection K acquired (hold 7ms, wait 0ms)
t+95ms  Connection K released
t+90ms  Connection L acquired (hold 7ms, wait 0ms)
t+97ms  Connection L released
t+93ms  Connection M acquired (hold 6ms, wait 1ms)
t+99ms  Connection M released
t+95ms  Connection N acquired (hold 6ms, wait 1ms)
t+101ms  Connection N released
t+97ms  Connection O acquired (hold 5ms, wait 1ms)
t+102ms  Connection O released
t+99ms  Connection P acquired (hold 4ms, wait 1ms)
t+103ms  Connection P released
t+101ms  Connection Q acquired (hold 4ms, wait 1ms)
t+105ms  Connection Q released
t+102ms  Connection R acquired (hold 5ms, wait 0ms)
t+107ms  Connection R released
t+104ms  Connection S acquired (hold 3ms, wait 1ms)
t+107ms  Connection S released
t+105ms  Connection T acquired (hold 3ms, wait 1ms)
t+108ms  Connection T released
…
```

---

## Section 3 — ATP Data Volume Analysis

| Entity | Row Count |
|--------|----------:|
| transactions | 4988 |
| invoices | 1602 |
| bills | 233 |
| contacts | 353 |
| units | 137 |
| properties | 126 |
| contracts | 8 |
| rentalAgreements | 115 |
| projectAgreements | 124 |
| projects | 16 |
| accounts | 21 |
| categories | 106 |
| agreements | 239 |

### Raw SQL probe (same queries as bootstrap, direct pool)

| Query | Avg | P95 | Max |
|-------|----:|----:|----:|
| countTenantTransactions SQL | 2 | 3 | 3 |
| listTransactions page SQL | 9 | 20 | 20 |

---

## Section 4 — Pool Pressure Contributors

| Rank | Operation | Evidence |
|-----:|-----------|----------|
| 1 | entityLoaderTotal | P95=132ms avg=114ms max=132ms (n=5) |
| 2 | listTransactions | P95=28ms avg=19ms max=28ms (n=5) |
| 3 | countTenantTransactions | P95=7ms avg=3ms max=7ms (n=5) |
| 4 | fetchPlSubTypesForTenant | P95=7ms avg=5ms max=7ms (n=5) |
| 5 | authMiddleware | P95=1ms avg=0ms max=1ms (n=5) |
| 6 | entity loader: invoices | P95=42ms max=42ms rows=1602 |
| 7 | entity loader: accounts | P95=20ms max=20ms rows=32 |
| 8 | entity loader: projectAgreements | P95=20ms max=20ms rows=124 |
| 9 | connection hold sum (bulk route) | sumHoldMs=699 peakSimultaneous=13 cycles=89 |

---

## Section 5 — Root Cause Verdict

On tenant `rk-builders-284d6d` (4988 transactions, 1602 invoices), **entityLoaderTotal** is the slowest bootstrap stage by P95 (**132 ms**). Top entity loader: **invoices** (P95 42 ms). Raw SQL probe: countTenantTransactions P95=3 ms, listTransactions page P95=20 ms. With PERF-P2-B (peak ~4 simultaneous bootstrap connections; bypass paths for count/plSubTypes/listTransactions), **stage duration × connection overlap × concurrent login/nav requests** — not entity-count growth or `runBatched` concurrency alone — drives cumulative pool pressure and `POOL_SATURATED` on production ATP.

---

## Measurement 5 — P95 Query Report

| Query / Stage | Avg | P95 | Max |
|---------------|----:|----:|----:|
| overallRequest | 154 | 175 | 175 |
| countTenantTransactions | 3 | 7 | 7 |
| entityLoaderTotal | 114 | 132 | 132 |
| fetchPlSubTypesForTenant | 5 | 7 | 7 |
| listTransactions | 19 | 28 | 28 |
| entity:invoices | 32 | 42 | 42 |
| entity:accounts | 14 | 20 | 20 |
| entity:projectAgreements | 14 | 20 | 20 |
| entity:bills | 13 | 19 | 19 |
| entity:rentalAgreements | 12 | 15 | 15 |

---

## Re-run

```powershell
node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --env .env.production.render --tenant rk-builders-284d6d --iterations 5
node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --tenant atp-8da881 --iterations 3
```

Remote wall-clock (production JWT required):

```powershell
$env:PBooks_BENCHMARK_TOKEN = "<JWT>"
node --import tsx scripts/perf/perf-p2-c-atp-bootstrap-query-analysis.mjs --remote --base https://api.pbookspro.com/api/v1 --tenant atp-8da881 --iterations 10
```
