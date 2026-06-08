# Steady State — Project Quality Standards

> **Purpose**: This file encodes enterprise-quality development standards. Every change you make MUST adhere to these rules. They exist because systemic issues (enum mismatches, missing validation, zero test coverage on critical paths) were discovered after partner review — this is the fix at the root.

---

## Rule 0: Always Verify, Never Assume

**The most important rule.** When you fix a bug, you MUST:

1. **Write a test that reproduces the bug** before fixing it
2. **Verify the fix with that test** (the test must pass after your change)
3. **Run ALL existing tests** to ensure nothing regressed — every single time
4. **Manually trace the full data flow** from frontend input → API request → server validation → database write → response → UI render

Without this, you are guessing. Partners should not be the ones finding bugs.

---

## Rule 1: Schema-Enum Parity (CRITICAL)

The #1 source of bugs in this project is **mismatch between Zod validation schemas and Prisma database enums**.

**Every time you touch a Zod schema or Prisma enum, you MUST:**

1. Open `apps/web/prisma/schema.prisma` and find the relevant enum
2. Open `apps/web/lib/schemas/*.ts` and verify EVERY enum value is represented
3. Check every API route that uses that schema — the `validStatuses` / filter arrays must also match
4. Check every frontend form that offers that enum as a dropdown — options must match

**Example of the bug this prevents:**
- Prisma `MembershipStatus`: `ACTIVE | EXPIRED | PAUSED | FROZEN | CANCELLED | PENDING | PENDING_PAYMENT`
- Zod `createMemberSchema`: only had `ACTIVE | FROZEN | CANCELLED | PENDING_PAYMENT`
- Frontend dropdown: offered `PENDING`, `PAUSED`, `EXPIRED`
- **Result**: Selecting those statuses caused opaque Zod errors displayed as form errors

**Checklist when touching enums:**
```
[] Prisma enum values
[] Zod schema enum values (exact match)
[] API route validStatuses / filter arrays (exact match)
[] Frontend dropdown/label options (exact match)
[] Test that parses every enum value
```

---

## Rule 2: No Untested Code Paths

**Every API route, schema, and form component MUST have tests.**

### Minimum test requirements:

| Code type | Minimum tests |
|---|---|
| API route (GET) | Success case + empty state + filtering + pagination edge cases |
| API route (POST) | Success + missing required fields (400) + duplicate/conflict (409) |
| API route (PATCH) | Success + not-found (404) + invalid state transition (400) |
| Zod schema | Every valid enum value + every invalid value + null/undefined handling |
| Form component | Opens/closes + required field validation + submit disabled states + error display |
| Form input component | Normalization (spaces, formats) + empty/null handling + invalid rejection |

### Test file placement:
- API tests → `apps/web/app/__tests__/api/<resource>.spec.ts`
- Schema tests → `apps/web/lib/schemas/<name>.spec.ts`
- Component tests → `apps/web/<path>/__tests__/<component>.spec.tsx`

### Before marking work complete, verify:
```
[] New tests exist for the code I changed
[] ALL existing tests pass (run: npx vitest run --config apps/web/vitest.config.ts)
[] Coverage of changed files is at least at the level of existing tests
```

---

## Rule 3: Frontend Form Validation Must Match Backend

**Every form that posts to an API MUST:**

1. **Disable the submit button** for ALL conditions that would cause a server-side 400:
   - Required fields empty
   - Fields with falsy values that the server requires (e.g., `amountAed: 0` is falsy but the server needs `!amountAed` check)
2. **Normalize/normalize phone numbers, dates, and currency** on the client before sending
3. **Show field-level validation errors** — don't just rely on a generic error banner
4. **Handle null vs undefined vs empty string** consistently with the Zod schema

**Common gotcha with JavaScript falsy values:**
```ts
// BUG: 0 is a valid amount but is falsy
if (!amountAed) { /* rejects 0 */ }

// CORRECT:
if (amountAed === undefined || amountAed === null) { /* only rejects missing */ }
// or for numbers that can be 0:
if (!amountAed && amountAed !== 0) { /* rejects 0 */ }
```

---

## Rule 4: Bug Investigation Protocol

When the user reports a bug:

1. **Read the error message/image carefully** — don't guess
2. **Trace the full data flow**: UI input → state → API payload → server validation → DB operation → response → error handling → UI display
3. **Check ALL layers**, not just the one the user mentions:
   - Client-side validation (form disable conditions)
   - Network request (correct URL, method, headers, body shape)
   - Server-side Zod validation (enum values, regex patterns)
   - Database constraints (unique indexes, foreign keys, Prisma enums)
   - Error handling (how the error message reaches the user)
4. **Look for systemic issues**: If you find ONE enum mismatch, check ALL other enums in the same file
5. **Write a test that reproduces the bug** before fixing it

---

## Rule 5: Date & Number Input Standards

### Date Pickers:
- Every `CalendarPopover` instance MUST allow year-level navigation (double-chevrons + clickable year)
- Users must be able to jump directly to any year between 1900 and current+5
- Never force users to scroll month-by-month across decades

### Phone Numbers:
- Client-side: auto-strip spaces, dashes, parentheses, and dots before sending
- Server-side: use `z.preprocess` to normalize, then validate E.164 with `/^\+[1-9]\d{6,14}$/`
- Hint text: Show E.164 format AND mention that spaces/dashes are OK
- Null/undefined must NOT trigger normalization errors

### Currency/Amounts:
- All amounts in the API are in **fils** (1 AED = 100 fils)
- Frontend displays: convert to AED (`amount / 100`)
- Button disable checks: use explicit `!== 0` not `!value` for amounts

---

## Rule 6: Code Quality Checklist (Before Every Commit)

```
[] New code has corresponding tests
[] All existing tests pass (npx vitest run --config apps/web/vitest.config.ts)
[] Zod schemas match Prisma enums exactly
[] Frontend dropdown options match backend Zod enums
[] API route filter arrays match Prisma enums
[] Forms disable submit for all server-rejectable states
[] Phone numbers are normalized (client + server)
[] Date pickers have year navigation
[] Null/undefined is handled correctly in all Zod transforms
[] Error messages are user-facing (not raw Zod error dumps)
[] No console.log left in production code
```

---

## Rule 7: Test Infrastructure

The vitest config is at `apps/web/vitest.config.ts` with these include patterns:
```
app/**/*.spec.{ts,tsx}
components/**/*.spec.{ts,tsx}
lib/**/*.spec.{ts,tsx}
```

**Running tests:**
```bash
# All tests
npx vitest run --config apps/web/vitest.config.ts

# Specific file
npx vitest run --config apps/web/vitest.config.ts <absolute-path-to-test>

# Watch mode
npx vitest --config apps/web/vitest.config.ts
```

**Test helpers** are in `apps/web/app/__tests__/api/test-helpers.ts` — use `MOCK_USER`, `createReq`, `jsonBody` for API tests.

---

## Why This Exists

These rules were created after the following systemic issues were found during partner review:

1. **Membership status enum mismatch** — Zod only accepted 4 of 7 Prisma statuses, frontend offered all 7
2. **Date picker missing year navigation** — users had to click 400+ times to reach a birth year
3. **Phone numbers rejected despite correct format** — spaces in +971 50 123 4567 caused regex failures
4. **Invoice creation silently blocked** — button enabled but server rejected due to falsy 0 amount check
5. **Zero test coverage on billing, staff, checkins, POS** — critical business flows had no automated verification

These were not one-off bugs — they were **systemic quality failures** that a proper test suite and review checklist would have caught. Follow these rules to ensure they never happen again.
