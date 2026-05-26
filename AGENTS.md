# AGENTS.md — SteadyState

> **Read this file first.** It is the single source of truth for any AI agent or developer
> working on this codebase. It is intentionally dense — every line matters.

---

## 1. What is SteadyState?

SteadyState is a **multi-tenant B2B SaaS** that sits as an **intelligence/automation layer** on top
of existing gym CRMs (Mindbody, Glofox, Zenoti, Virtuagym, GymMaster, Simple Logic, Elewix).
Target market: **UAE premium gym operators**. We do not replace the CRM — we read its data and
fire automated actions (primarily WhatsApp via Twilio).

The five product pillars (in priority order):

1. **Real-time churn triggers** → WhatsApp nudge when a member goes 5 days without check-in.
2. **One-tap supplement shop** → Post-workout in-app product surface.
3. **Salary-synced billing** → Shift payment retries to UAE salary credit dates (25th–28th).
4. **Door-event intelligence** → Behavioural triggers from biometric/access events.
5. **UAE compliance layer** → VAT, Arabic WhatsApp, Ramadan-aware scheduling, DIFC data residency.

**Company:** Nuviq · Dubai, UAE.

---

## 2. Architecture at a Glance

```
apps/web (Next.js 15)  ─►  apps/api (NestJS)  ─►  PostgreSQL (Prisma)
                                  │                Redis (BullMQ queues)
                                  ├─► CRM Connectors (Mindbody, Glofox, …)
                                  └─► Twilio WhatsApp
```

- **Multi-tenancy model:** single PostgreSQL database, **row-level isolation via `tenantId`** on
  every tenant-scoped table. Every API endpoint MUST scope queries by the authenticated user's
  `tenantId`. Never trust a `tenantId` from the request body.
- **Async work:** anything touching a 3rd-party API (CRM, Twilio) goes through a **BullMQ queue**.
  HTTP handlers stay fast and return job IDs where appropriate.
- **Data residency:** production runs in AWS `me-south-1` (Bahrain). No PII leaves the region.

---

## 3. Tech Stack (Locked Decisions — Do Not Change Without Discussion)

| Concern | Choice | Notes |
|---|---|---|
| Package manager | `pnpm@9` | workspaces + Turborepo |
| Monorepo | Turborepo | `turbo.json` at root |
| Language | TypeScript (strict) | `tsconfig.base.json` at root |
| Backend | NestJS 10 | modular, DI-friendly |
| Frontend | Next.js 15 (App Router) | TypeScript + Tailwind |
| DB | PostgreSQL 16 + Prisma | migrations in `apps/api/prisma` |
| Cache/Queue | Redis 7 + BullMQ | |
| Auth | JWT (access + refresh) | bcrypt for passwords |
| WhatsApp | Twilio | sandbox in dev, Business API in prod |
| Payments | Stripe (intl) + Telr (UAE) | for **our** subscription billing |
| Tests | Vitest (units) + Jest+Supertest (e2e for Nest) | |
| Lint/Format | ESLint + Prettier | |
| Runtime | Node 20 LTS | |

---

## 4. Repository Layout

```
steady-state/
├── apps/
│   ├── api/                # NestJS backend
│   └── web/                # Next.js dashboard
├── packages/
│   └── shared-types/       # TS types shared between api + web
├── docker-compose.yml      # Postgres + Redis for local dev
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── AGENTS.md               # ← you are here
└── README.md               # human onboarding
```

Inside `apps/api/src`:

```
src/
├── main.ts                 # bootstrap
├── app.module.ts
├── common/                 # cross-cutting: guards, decorators, filters, pipes
├── config/                 # typed env config (Zod-validated)
├── prisma/                 # PrismaService + module
├── auth/                   # JWT auth, signup, login
├── tenants/                # tenant + user mgmt
├── members/                # gym member data (synced from CRMs)
├── whatsapp/               # Twilio service
├── crm/                    # CRM connector modules (one per provider)
│   ├── mindbody/
│   ├── glofox/
│   └── …
├── automation/             # rule engine: signal → action
└── health/                 # health/readiness endpoints
```

---

## 5. Development Workflow

```bash
# First-time setup
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Local infra (requires Docker Desktop running)
pnpm db:up
pnpm db:migrate

# Run everything
pnpm dev

# Or per-app
pnpm --filter @steady-state/api dev
pnpm --filter @steady-state/web dev

# Quality gates — must all be green before PR
pnpm typecheck
pnpm lint
pnpm test
```

---

## 6. Conventions That Save Tokens (READ ME, AGENT)

### Code style
- **No barrel `index.ts` files** that re-export everything. Import from explicit paths.
- **Use Zod** for any runtime validation (env, request bodies, CRM responses).
- **No `any`** — if a 3rd-party API is poorly typed, write a Zod schema and infer the type.
- **No comments explaining what code does** — only *why*, if non-obvious.
- **Small files.** A file >300 lines is a code smell. Split it.

### Naming
- Files: `kebab-case.ts` (e.g. `churn-detector.service.ts`)
- Classes: `PascalCase`
- Test files: co-located, suffix `.spec.ts` for unit, `.e2e-spec.ts` for e2e
- Env vars: `SCREAMING_SNAKE_CASE`, namespaced (e.g. `TWILIO_ACCOUNT_SID`)

### Multi-tenancy rule (CRITICAL)
Every Prisma query against a tenant-scoped model MUST include `tenantId` in the `where` clause.
Use the `RequestTenant` decorator + guard to inject the authenticated tenant. Code review must
reject any query without it.

### CRM connectors — develop without sandboxes
We **do not have Mindbody, Glofox, or Zenoti sandbox accounts yet.** Therefore:

1. Each CRM module exposes an **interface** (`CrmConnector`) — sync members, sync visits, post webhook.
2. Each provider has **two implementations**:
   - `MindbodyHttpConnector` — real HTTP calls, written from official docs.
   - `MindbodyFakeConnector` — in-memory fixture data shaped like the real API response.
3. Choice of implementation is **driven by env var** (`CRM_MODE=fake|live`).
4. All tests use the fake. The live implementation is exercised only against real credentials
   when the user supplies them.
5. Real API response shapes live in `packages/shared-types/src/crm/<provider>/` as Zod schemas.
   These schemas are the contract — write them from the official docs first, then build against them.

### Testing
- **Unit tests** (Vitest): pure logic, services with mocked deps. Co-located.
- **E2E tests** (Jest + Supertest): full HTTP request → DB. Use a separate test database
  (`postgres://…/steady_state_test`) — never the dev DB.
- **Twilio is always mocked** in tests. Never hit the real API from a test.
- **CRM is always faked** in tests.
- Target: ≥80% coverage on `src/` (excluding `main.ts` and modules).
- A change is not done until `pnpm typecheck && pnpm lint && pnpm test` all pass.

### Git
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional Commits: `feat(api): add churn detector`.
- No commits to `main` directly. PRs only.
- Never use `--force` push.

---

## 7. Environment Variables (Authoritative List)

See each app's `.env.example` for the canonical list. Summary:

**`apps/api/.env`**
- `NODE_ENV` — `development` | `test` | `production`
- `PORT` — default `4000`
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — `redis://localhost:6379`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random strings
- `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` — e.g. `15m`, `7d`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — `whatsapp:+14155238886` for sandbox
- `TWILIO_MODE` — `live` | `mock` (default `mock` in dev/test)
- `CRM_MODE` — `live` | `fake` (default `fake` until we have real credentials)
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`

**`apps/web/.env.local`**
- `NEXT_PUBLIC_API_URL` — `http://localhost:4000`

All env loading goes through `apps/api/src/config/env.config.ts` with a Zod schema. Do not
read `process.env.X` directly in business code.

---

## 8. Things That Will Bite You

- **WhatsApp sandbox**: recipients must first send a join code to the Twilio sandbox number
  before they receive any messages. Document this in the user-facing onboarding.
- **WhatsApp templates**: production messages outside the 24-hour user-initiated window
  require pre-approved templates from Meta. Build assuming we'll need them.
- **Mindbody partnership approval** takes weeks. Develop against Zod-typed fixtures from their
  public API docs (https://developers.mindbodyonline.com/PublicDocumentation/V6).
- **Ramadan logic** is not a feature flag — it is a scheduling layer that suppresses non-essential
  outbound messages between Fajr and Iftar. Bake it into the WhatsApp send service.
- **Phone number normalisation**: store every member phone as E.164 (`+9715…`). UAE CRMs are
  inconsistent about formatting.

---

## 9. Phase Status

- [x] **Phase 1** — Foundation: monorepo, NestJS, Next.js, Prisma, Auth, Twilio mock, tests.
- [x] **Phase 2** — CRM Big Three connectors (Mindbody, Glofox, Zenoti) as faked implementations + BullMQ sync queue.
- [x] **Phase 3** — Churn trigger engine + WhatsApp dispatch (5-day idle detection, dedup cooldown, Ramadan guard stub, BullMQ cron).
- [x] **Phase 3.5** — Operator dashboard: Next.js login/signup, overview KPIs, members table, CRM connections (list/create/sync), automation (signals + run-now), WhatsApp messages — talks to API via httpOnly cookie + proxy routes.
- [x] **Phase 4** — Salary-synced billing: salary windows, invoices, payment attempts, BullMQ cron, EN/AR reminders, dashboard page.
- [x] **Phase 5** — Supplement shop (VAT-aware), door-event HMAC webhook + signal derivation (after-hours / tailgate), mid-market CRMs (Virtuagym, GymMaster) as fakes, Ramadan + Arabic locale on churn nudges, DATA_REGION env.
- [x] **Phase 6** — Hardening: @nestjs/throttler global guard (stricter on /auth), real /health via terminus + Prisma, GitHub Actions CI, multi-stage Dockerfiles for api + web.
- [x] **Phase 7** — GTM: marketing landing + pricing pages, signup auto-starts 14-day trial subscription, ActiveSubscriptionGuard returns HTTP 402 on trial expiry, super-admin /admin/tenants endpoint + page, in-app /docs page.
- [x] **Phase 8** — Native gym CRM (API): memberships + booking, payments (Stripe v18 pinned + payment attempts), staff (PIN auth), classes (sessions/bookings), leads (+ convert), check-in (member QR + kiosk PIN), POS (PRODUCT/MEMBERSHIP/CLASS_DROPIN/DAY_PASS, VAT-aware), notification dispatcher (WhatsApp now, EN/AR templates), reporting (revenue / member growth / class utilisation / staff commission), CSV importer (members), member portal API (`/m/*` via Clerk + MemberAuthGuard), and global AuditLog interceptor. 139 Vitest specs green.
- [x] **Phase 9** — Membership Auto-Renewal Engine: `MembershipRenewalService` (finds ACTIVE memberships on `autoRenew=true`/non-Stripe plans expiring within 7-day window, creates PENDING_PAYMENT renewal with deduplication, dispatches EN/AR WhatsApp reminders); `MembershipRenewalScheduler` (BullMQ cron: daily 09:00 UTC process, 09:30 UTC final-reminder for renewals starting within 3 days); `GET /memberships/renewals` + `POST /memberships/process-renewals` controller endpoints; operator dashboard "Auto-Renewals" tab with badge count and manual run-now button. 280 Vitest specs green.
- [x] **Phase 10** — Stripe Subscription Billing: `StripeProvider` interface + `MockStripeProvider` (in-memory, mock-stripe.local URLs) + `LiveStripeProvider` (Stripe SDK v18, `2025-08-27.basil`); `SubscriptionService` gains `createCheckoutSession`, `createPortalSession`, `handleProviderWebhook` (processes `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_succeeded/failed`); `AuthenticatedUser` extended with `email`; `ClerkAuthGuard` + `JwtStrategy` updated to populate email; Prisma `Subscription` model gains `stripeCustomerId` + `stripeSubscriptionId` columns; `POST /subscriptions/checkout` + `POST /subscriptions/portal` endpoints; `STRIPE_PRICE_STARTER/GROWTH/SCALE` env vars; Next.js subscription page updated with plan upgrade CTAs + "Manage billing" portal button; Next.js proxy routes for checkout + portal; 295 Vitest specs green.

Update this section whenever a phase completes.

---

## 10. When You're Stuck

1. Check `memory/repo/` for any verified notes from prior sessions.
2. Check `.github/copilot-instructions.md` for Copilot-specific guidance.
3. Re-read this file. Most architectural questions are answered above.
4. If you must guess, write a fake/stub with a `TODO(human):` comment and tell the user.
