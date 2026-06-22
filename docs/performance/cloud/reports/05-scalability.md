# Scalability Report (Phase 5)

**Environment:** _  
**Date:** _  
**Tenant label:** _large / default_  
**Iterations:** _  

---

## Results by group

### Login / bootstrap

| Endpoint | p50 ms | p95 ms | totalCount |
|----------|-------:|-------:|-----------:|

### Dashboard

| Endpoint | p50 ms | p95 ms | totalCount |
|----------|-------:|-------:|-----------:|

### Reports

| Endpoint | p50 ms | p95 ms | totalCount |
|----------|-------:|-------:|-----------:|

### Payroll (read-only probe)

| Endpoint | p50 ms | p95 ms | totalCount |
|----------|-------:|-------:|-----------:|

_Source: `npm run perf:cloud:scalability`_

---

## Top 10 by p95 (this run)

| Rank | Path | p95 ms | Group |
|---:|---|---:|---|

---

## Comparison vs small tenant

| Endpoint | Small p95 | Large p95 | Ratio |
|----------|----------:|----------:|------:|

---

## Sign-off

- [ ] Large-tenant dataset representative of production scale
- [ ] Ready for optimization roadmap finalization
