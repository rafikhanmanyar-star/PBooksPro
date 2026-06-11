# Architecture v2 — Documents (R2) Phased Migration

Migrate document storage from inline `documents.file_data` to `document_metadata` + R2 (with inline fallback when R2 is not configured).

**API contract unchanged:** clients continue to send/receive `fileData` (base64), `name`, `type`, `entityId`, `entityType`, etc.

---

## Phase 1 — Route wiring + dual-read ✅ (implemented)

**Goal:** `documentsRoutes` delegates to `modules/documents/`; new writes use `document_metadata`; reads merge metadata + legacy rows.

| Task | Status |
|------|--------|
| Migration `110`: add `name`, `type`, `inline_data` to `document_metadata` | Done |
| Expand `DocumentRepository` (list, upsert, soft delete, version check) | Done |
| `documentsModuleService` — CRUD with R2 or inline fallback | Done |
| Wire `documentsRoutes` → module service | Done |
| Legacy `documents` table read fallback for existing rows | Done |
| `recordDomainMutation` on create/update/delete | Done |
| Unit tests for module service mappers + version conflict | Done |

**Apply migration:** `npm run db:migrate:staging` or `npm run db:migrate:production`

**Out of scope for Phase 1:** bulk state loader changes, data backfill script, dropping legacy table.

---

## Phase 2 — Backfill & unified reads ✅ (implemented)

**Goal:** Move existing `documents.file_data` blobs to R2 (or `inline_data`); single list path for `/state/bulk`.

| Task | Status |
|------|--------|
| Backfill script: `documents` → `document_metadata` + R2 upload | Done — `npm run backfill-documents-metadata --prefix backend` |
| Update `appStateBulkService` to list via `documentsModuleService` | Done |
| Verify tenant isolation on storage keys (`tenantId/entityType/id/file`) | Done — unit test |
| Run backfill on staging/production tenants | **Manual** — see commands below |

**Backfill commands:**

```powershell
# Staging — dry run first
dotenv -e .env.staging -- npm run backfill-documents-metadata --prefix backend -- --tenant YOUR_TENANT_ID --dry-run

# Staging — migrate one tenant
dotenv -e .env.staging -- npm run backfill-documents-metadata --prefix backend -- --tenant YOUR_TENANT_ID

# All tenants with pending legacy documents
dotenv -e .env.staging -- npm run backfill-documents-metadata --prefix backend -- --all
```

After backfill, legacy `documents` rows are soft-deleted so dual-read does not duplicate entries.

---

## Phase 3 — Retire legacy table ✅ (implemented)

**Goal:** All document I/O through `document_metadata`; block legacy `documents` mutations.

| Task | Status |
|------|--------|
| Stop writing to `documents` table | Done — DB trigger `trg_documents_reject_mutations` (migration 111) |
| Remove legacy dual-read from `documentsModuleService` | Done |
| Remove `backend/src/services/documentsService.ts` | Done — use `modules/documents/services/documentsModuleService.ts` |
| Storage metering uses `document_metadata` | Done — `subscriptionUsageService` |
| Optional: drop `documents.file_data` column | Deferred — table kept as read-only archive |

**Apply migration:** `npm run db:migrate:staging` / `npm run db:migrate:production` (migration `111`)

**Order:** Run Phase 2 backfill on all tenants **before** migration 111 when possible. Backfill can still soft-delete legacy rows after 111 via session flag `pbooks.documents_backfill=1`.

---

## Environment (R2)

Set in `.env.staging` / `.env.production`:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=
R2_ENDPOINT_URL=   # optional; default https://{accountId}.r2.cloudflarestorage.com
```

When R2 is **not** configured, Phase 1 stores bytes in `document_metadata.inline_data` (dev/local).

---

## Verification (Phase 1)

- [ ] `POST /api/v1/documents` creates row in `document_metadata` (not `documents`)
- [ ] `GET /api/v1/documents/:id` returns same JSON shape including `fileData`
- [ ] Legacy rows in `documents` still returned on list/get
- [ ] `DELETE /api/v1/documents/:id` soft-deletes metadata row; version conflict returns 409
- [ ] `npm run build:backend` succeeds
