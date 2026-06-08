# Test Coverage Tracker

> **Last audit**: 2026-06-07 — **332 tests, 23 test files, ~75% API coverage**
> **Status**: 🟢 SIGNIFICANTLY IMPROVED — from D+ to B+

---

## Progress Dashboard

| Phase | Domain | Routes | Status |
|---|---|---|---|
| 1 | Membership Lifecycle | 7 | ✅ Done — 24 tests |
| 2 | POS Payments | 4 | ✅ Done — 12 tests |
| 3 | Staff | 3 | ✅ Done — 10 tests |
| 4 | WhatsApp | 4 | ✅ Done — 7 tests |
| 5 | Auth | 2 | ✅ Done — 3 tests |
| 6 | Membership Plans | 4 | ✅ Done — 5 tests |
| 7 | Importer | 2 | ✅ Done — 5 tests (also fixed 2 production bugs) |
| 8 | Classes Remaining | 8 | ✅ Done — 12 tests |
| 9 | Frontend Components | 12 | ⬜ Pending — 3 partially tested |
| 10 | E2E Workflows | 4 flows | ⬜ Pending |
| 11 | Final Audit & Polish | — | ⬜ Pending |

**Legend**: ⬜ Pending | 🟡 In Progress | ✅ Done

---

## Before vs After

| Metric | Before | After | Change |
|---|---|---|---|
| Test files | 17 | **23** | +6 |
| Test cases | 251 | **332** | +81 |
| API routes tested | 8/57 (14%) | **~43/57 (75%)** | +35 routes |
| API test files | 8 | **14** | +6 |
| Component test files | 5 | 5 | same |
| Schema test files | 2 | 2 | same |
| Production bugs found | — | **3** | CSV import broken, invoice create blocked, membership enum mismatch |

---

## Remaining Gaps (14 routes)

### Billing (4 routes)
- `POST /api/billing/invoices/[id]/void` — void invoice
- `POST /api/billing/invoices/[id]/write-off` — write off invoice
- `POST /api/billing/process` — process retries
- `GET /api/billing/salary-window` + `PUT` — salary window config

### Classes (4 routes)
- `PATCH /api/classes/types/[id]` — update class type
- `GET /api/classes/sessions/[id]` — get session detail
- `PATCH /api/classes/sessions/[id]` — update session
- `DELETE /api/classes/recurrences/[id]` — delete recurrence

### Members (2 routes)
- `GET /api/members/[id]` — get member detail
- `POST /api/members/[id]/deactivate` — deactivate member

### Shop (2 routes)
- `POST /api/shop/products` — create product
- `PATCH /api/shop/products/[id]` — update product

### WhatsApp (1 route)
- `POST /api/whatsapp/messages/broadcast` — broadcast

### Health (1 route)
- `GET /api/health` — health check

---

## Remaining Frontend Components (9 components)

- `members-client.tsx` — member list/search/filter/pagination
- `member-detail-client.tsx` — member detail view
- `membership-actions-client.tsx` — freeze/cancel/activate buttons
- `csv-import-modal.tsx` — CSV import workflow
- `classes-client.tsx` — class schedule view
- `session-form-modal.tsx` — create/edit sessions
- `session-detail-modal.tsx` — session detail with bookings
- `recurrence-form-modal.tsx` — recurrence pattern form
- `checkins-client.tsx` — attendance list
- `staff-client.tsx` — staff management
- `messages-client.tsx` — WhatsApp messages
- `memberships-client.tsx` — membership list

---

## Bugs Discovered During Testing

1. **CSV Importer broken (CRITICAL):** `parseCsv()` lowercases all CSV headers (`fullName` → `fullname`) but the route code accesses `row.fullName` (case-sensitive). Result: ALL CSV imports silently produced zero rows. Fixed in both `preview/route.ts` and `apply/route.ts`.

2. **Invoice creation silently blocked:** "Create Invoice" button didn't check `amountAed > 0`, server rejected with 400. Fixed button disabled condition.

3. **Membership status enum mismatch:** Zod only accepted 4 of 7 Prisma statuses. Aligned all layers.

4. **Phone validation rejected valid formats:** Spaces/dashes/parens in phone numbers caused E.164 regex failure. Added `preprocess` normalization.
