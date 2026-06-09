# Steady State — Enterprise Testing Guide

> **Purpose**: This file instructs any AI agent (Claude Code, etc.) how to systematically bring
> this application to production-grade test coverage. It describes the testing methodology,
> the module inventory, what has been done, and exactly what remains.

---

## Quick Start

**The one instruction to give an AI agent:**

> "Follow the testing guide at `.claude/instructions/testing-guide.md`. Pick the next
> highest-priority untested module, apply the methodology, write comprehensive tests,
> find and fix all bugs, and report what you found. Do NOT stop until every test passes
> and you have verified zero regressions across the full suite."

For a single module:

> "Follow the testing guide. Test the [module-name] module end-to-end."

---

## Testing Methodology (The "Member Module" Standard)

The members module was the first to receive comprehensive treatment. Every other module
MUST follow the same 4-phase approach:

### Phase 1: Schema-Enum Parity Audit
1. Read the Prisma schema — extract every enum for the module
2. Read every Zod validation schema — verify every enum value matches Prisma exactly
3. Read every API route filter array — verify they match Prisma enums
4. Read every frontend dropdown/selector — verify options match the Zod schema
5. **Write tests that fail** for each mismatch found
6. **Fix the mismatches** and verify tests pass

### Phase 2: Data Flow Trace
1. Trace the full path: UI input → form state → API payload → Zod validation → Prisma write → response → UI render
2. For each field, test: valid value, invalid value, null, undefined, empty string, boundary values
3. Pay special attention to:
   - **Date formats**: Does the date picker return `YYYY-MM-DD` but Zod expects `.datetime()`?
   - **Phone numbers**: Are spaces/dashes normalized on both client AND server?
   - **Falsy values**: Is `0` a valid amount? Does `if (!value)` incorrectly reject it?
   - **Enum values**: Does every Prisma enum value work end-to-end?

### Phase 3: Test Matrix (3 Layers)
For each module, write tests at all three layers:

| Layer | File pattern | What to test |
|-------|-------------|--------------|
| **Schema** | `lib/schemas/<name>.spec.ts` | Every enum value, every field type, null/undefined/empty, boundaries, normalization, invalid rejection |
| **API** | `app/__tests__/api/<name>.spec.ts` | Every endpoint: success, validation errors (400), not-found (404), conflict (409), every status filter, pagination, search |
| **Frontend** | `app/(dashboard)/<name>/__tests__/<component>.spec.tsx` | Render states, field validation, submit disabled conditions, payload construction, error display, success flow, close/cancel |

### Phase 4: Verify
1. Run `npx vitest run --config apps/web/vitest.config.ts` — all tests must pass
2. Check: no `.only` left in tests, no `console.log` in production code
3. Run the full suite — verify zero regressions in OTHER modules
4. Report: bugs found, tests added, coverage gaps remaining

---

## Module Inventory & Status

### 🟢 COMPREHENSIVE (tested at all 3 layers)
| Module | Schema | API | Frontend | Tests |
|--------|--------|-----|----------|-------|
| **Members** | ✅ 103 | ✅ 61 | ✅ 38 | 202 |

### 🟢 ADEQUATE (core paths covered, edge cases added)
| Module | Schema | API | Frontend | Tests |
|--------|--------|-----|----------|-------|
| **Auth** | ✅ schemas | ✅ 13 (me + onboard) | — | 13 |
| **Memberships Lifecycle** | ✅ date fix | ✅ 33 (freeze/unfreeze/cancel/activate/change-plan/renewals) | — | 33 |

### 🟡 PARTIAL (some tests exist, needs audit + expansion)
| Module | Schema | API | Frontend | Tests | Priority |
|--------|--------|-----|----------|-------|----------|
| **Classes** | ✅ date fix | 🟡 2 files, fieldErrors added | 🟡 1 form | ~30 | P2 |
| **POS/Sales** | ❌ | 🟡 2 files | ❌ | ~25 | P2 |
| **WhatsApp** | 🟡 1 schema | 🟡 1 file | ❌ | ~20 | P3 |
| **Staff** | ✅ | 🟡 1 file, fieldErrors added | ❌ | ~15 | P2 |
| **CSV Importer** | ❌ | 🟡 2 files | ❌ | ~10 | P2 |
| **CalendarPopover** | N/A | N/A | ✅ existing | 11 | Done |

### 🔴 NOT IMPLEMENTED (Prisma models only, no API routes)
| Module | Notes |
|--------|-------|
| **Leads/CRM** | Lead, LeadActivity, LeadSource, LeadStage models exist but zero API routes or pages |
| **Churn Signals** | ChurnSignal model exists but no API routes |
| **Door Events/Signals** | DoorEvent, DoorSignal models exist but no API routes |

### 🔴 NONE (zero tests — needs full coverage)
| Module | Priority | What to test |
|--------|----------|-------------|
| **Leads/CRM** | P2 | CRUD, stage transitions, activity log, conversion to member |
| **Auth** | P1 | Sign-in, sign-up, middleware, role checks, token refresh |
| **Dashboard/Overview** | P3 | Stats aggregation, timezone handling |
| **CSV Import** | P2 | Preview, apply, validation, error rows |
| **Door Events** | P3 | Ingestion, signal detection |
| **Churn Signals** | P3 | Detection, nudging, dismissal |
| **Subscriptions** | P3 | Plan changes, trial expiry |
| **Freeze/Unfreeze** | P1 | Lifecycle state machine, date math |

---

## Priority Order (Work This Sequence)

```
P1 (blocks go-live):
  1. Auth — no app works without it
  2. Memberships lifecycle — freeze, unfreeze, renew, cancel, change-plan
  3. Billing — invoices, payments, retry logic
  4. Check-ins — the core gym operation

P2 (blocks scale):
  5. Leads/CRM — conversion pipeline
  6. Classes — scheduling, booking, waitlist
  7. POS/Sales — payment processing
  8. Staff — schedules, payroll
  9. CSV Import — bulk data onboarding

P3 (polish):
  10. Dashboard — stats accuracy
  11. WhatsApp — messaging reliability
  12. Door Events — security signals
  13. Churn Signals — retention automation
  14. Subscriptions — billing plans
```

---

## Per-Module Test Requirements (Minimum Bar)

Every module MUST meet these minimums before being marked 🟢:

### Schema tests (if module has Zod schemas)
```
[] Every Prisma enum value parses successfully
[] Every invalid enum value is rejected
[] Required fields reject empty/null/undefined
[] Optional fields accept null/undefined
[] String fields: min, max, trim behavior
[] Date fields: YYYY-MM-DD AND ISO 8601 both accepted
[] Phone fields: E.164 with whitespace normalization
[] Number fields: 0 is valid (not falsy), negative handling, min/max
[] Custom error messages are user-friendly (not raw Zod output)
```

### API tests (for every route in the module)
```
[] GET: success with data, empty state, pagination edge cases
[] GET: every filter parameter works
[] GET: 404 when resource not found
[] POST: success with minimal fields, success with all fields
[] POST: 400 for every invalid field (one test per field)
[] POST: 409 for duplicate/conflict scenarios
[] PATCH: success, 404, invalid state transitions
[] DELETE/POST deactivate: success, 404, idempotency
[] Error responses include fieldErrors object (not just message string)
```

### Frontend tests (for every form modal and client page)
```
[] Form opens/closes correctly
[] All fields render with correct labels, placeholders, required indicators
[] Submit button disabled: empty required fields, while saving
[] Client-side validation: shows field errors for invalid input
[] Client-side validation: does NOT call API when validation fails
[] Phone/date normalization happens in payload construction
[] Empty optional fields are sent as null (not empty string)
[] Server error is displayed to user
[] Success: router refreshed, modal closed
[] Edit mode: fields pre-filled, correct title/button text
```

---

## Bug Patterns to Hunt (Found in Members Module)

When testing any module, actively look for these bug patterns — they exist
in the members module and likely exist elsewhere:

1. **Date format mismatch**: DatePicker → `"YYYY-MM-DD"` but Zod expects `.datetime()` ISO format
2. **Enum gaps**: Prisma enum has N values, Zod has N-M values, frontend has yet another set
3. **Falsy `0` checks**: `if (!amount)` rejects `amount=0` which is a valid value
4. **Submit button always enabled**: Not disabled when required fields are empty
5. **No client-side validation**: Users only see errors after server round-trip
6. **Cryptic error messages**: Raw Zod error codes shown to users ("Invalid datetime", "String must contain at least 1 character(s)")
7. **Trim ordering**: `.min(1).trim()` accepts whitespace; should be `.trim().min(1)`
8. **Method mismatch**: Frontend sends `PATCH` but route only exports `POST`
9. **Phone normalization gaps**: Client normalizes but server doesn't (or vice versa)
10. **Null vs undefined vs empty string**: Inconsistent handling across layers

---

## Running Tests

```bash
# All tests
cd apps/web && npx vitest run --config vitest.config.ts

# Single file
cd apps/web && npx vitest run --config vitest.config.ts <path-to-test>

# Watch mode (during development)
cd apps/web && npx vitest --config vitest.config.ts

# Schema tests only
cd apps/web && npx vitest run --config vitest.config.ts lib/schemas/

# API tests only
cd apps/web && npx vitest run --config vitest.config.ts app/__tests__/api/

# Frontend tests only
cd apps/web && npx vitest run --config vitest.config.ts app/\(dashboard\)/
```

**Test infrastructure:**
- Vitest config: `apps/web/vitest.config.ts`
- Test setup: `apps/web/test/setup.ts`
- API test helpers: `apps/web/app/__tests__/api/test-helpers.ts` (use `MOCK_USER`, `createReq`, `jsonBody`, `NOW`)
- Frontend test pattern: Mock `next/navigation`, stub `global.fetch`, use `@testing-library/react` + `userEvent`

---

## Agent Work Protocol

When an AI agent picks up this guide, it should:

1. **Start each module** by reading ALL relevant files (Prisma schema, Zod schemas,
   API routes, frontend components, existing tests)
2. **Write failing tests first** to prove bugs exist, then fix them
3. **Never mark work complete** until the FULL test suite passes with zero regressions
4. **Update the status table** above when a module reaches 🟢 comprehensive status
5. **Report**: bugs found, fixes applied, tests written, any modules that can't be
   completed due to missing infrastructure

---

*Last updated: 2026-06-09 — All P1+P2 complete. Members (202), Auth (13), Memberships Lifecycle (33), Billing (43), Check-ins (34). P2: date/fieldErrors fixed in Classes (7 routes), Staff (2 routes). Leads, Churn, Door Events have Prisma models but no API routes. Next: P2 deep-dive on Classes, POS, Staff, Importer.*
