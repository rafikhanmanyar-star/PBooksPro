# PERF-P2-A — Bootstrap Concurrency Benchmark

**Date:** 2026-06-23  
**Capture:** `perf-p2-a-concurrency-benchmark.json`  
**Script:** `scripts/perf/perf-p2-a-concurrency-benchmark.mjs`

## Variants (env-only — no production code change)

| Branch label | `BULK_BOOTSTRAP_CONCURRENCY` | Notes |
|--------------|------------------------------|-------|
| Variant A | 6 | Current production default |
| Variant B | 3 | Reduced parallel batches |
| Variant C | 2 | Further reduced |
| Variant D | 1 | Serial batches (closest to v1.2.416 single-client pattern) |

Variants were applied by spawning an isolated API on port **3002** with the env var set per run (equivalent to temporary test branches).

## Re-run

```powershell
node --import tsx scripts/perf/perf-p2-a-concurrency-benchmark.mjs
node --import tsx scripts/perf/perf-p2-a-concurrency-benchmark.mjs --variants 6,3 --skip-build
```

For large-tenant validation, set `$env:PBooks_BENCHMARK_TOKEN` and `$env:PBOOKS_VALIDATION_TENANT_ID` to a production JWT/tenant before re-run.
