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
Next.js 15 (App Router)  ──►  Supabase PostgreSQL (Prisma)
       │
       ├── Clerk (auth)
       ├── Twilio (WhatsApp)
       ├── Stripe (payments)
       └── Deployed on Vercel
```

- **Single Next.js app** — frontend (React Server Components + Client Components) and API routes
  (`app/api/*/route.ts`) run in the same Vercel deployment.
- **Supabase PostgreSQL** — managed database. Prisma ORM for type-safe queries.
- **Clerk** — authentication. Middleware protects dashboard and API routes.
- **Multi-tenancy model:** single PostgreSQL database, **row-level isolation via `tenantId`** on
  every tenant-scoped table. Every API route MUST scope queries by the authenticated user's
  `tenantId` via `requireServerUser()` from `lib/auth-server.ts`.
- **No queues, no Redis, no Docker.** Long-running operations use `Promise.all()` for parallelism.
  External API calls (Twilio, Stripe) are fast synchronous calls.

---

## 3. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Package manager | `pnpm@9` | |
| Language | TypeScript (strict) | |
| Frontend + API | Next.js 15 (App Router) | TypeScript + Tailwind |
| DB | Supabase PostgreSQL + Prisma | schema in `prisma/schema.prisma` |
| Auth | Clerk | `@clerk/nextjs` |
| WhatsApp | Twilio | mock in dev, Business API in prod |
| Payments | Stripe | |
| Tests | Vitest | |
| Lint/Format | ESLint + Prettier | |
| Hosting | Vercel | |

---

## 4. Repository Layout

```
steady-state/
├── apps/web/               # Next.js app (frontend + API routes)
│   ├── app/
│   │   ├── (dashboard)/    # Protected dashboard pages
│   │   └── api/            # API route handlers (direct Prisma queries)
│   ├── lib/
│   │   ├── prisma.ts       # Prisma client singleton
│   │   ├── auth-server.ts  # Server-side Clerk auth helpers
│   │   ├── api.ts          # Client-side API fetch helper
│   │   ├── session.ts      # Client-side session helpers
│   │   ├── schemas/        # Zod schemas (shared types)
│   │   ├── whatsapp.ts     # WhatsApp (Twilio) helper
│   │   └── billing-utils.ts# Billing calculation helpers
│   ├── prisma/             # Prisma schema + migrations
│   ├── middleware.ts       # Clerk middleware (protects dashboard + API)
│   ├── vercel.json         # Vercel deployment config
│   └── package.json
├── pnpm-workspace.yaml
├── package.json
├── AGENTS.md               # ← you are here
└── README.md               # human onboarding
```

---

## 5. Development Workflow

```bash
# First-time setup
pnpm install
cp apps/web/.env.example apps/web/.env.local

# Start dev server
pnpm dev

# Quality gates — must all be green before PR
pnpm typecheck
pnpm lint
pnpm test

# Database
pnpm db:generate    # Regenerate Prisma client
pnpm db:push        # Push schema to dev DB (no migration file)
pnpm db:migrate     # Create + apply migration
pnpm db:studio      # Open Prisma Studio
```

---

## 6. Conventions

### Code style
- **No barrel `index.ts` files** that re-export everything. Import from explicit paths.
- **Use Zod** for any runtime validation (env, request bodies, API responses).
- **No `any`** — write a Zod schema and infer the type.
- **No comments explaining what code does** — only *why*, if non-obvious.
- **Small files.** A file >300 lines is a code smell. Split it.

### Naming
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Test files: co-located, suffix `.spec.ts`
- Env vars: `SCREAMING_SNAKE_CASE`

### Multi-tenancy rule (CRITICAL)
Every Prisma query against a tenant-scoped model MUST include `tenantId` in the `where` clause.
Use `requireServerUser()` from `lib/auth-server.ts` to get the authenticated user's tenant
at the top of every API route handler. Code review must reject any query without it.

### API route handler pattern
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const user = await requireServerUser(); // throws if not authenticated
  // All queries scoped to user.tenantId
  const items = await prisma.member.findMany({ where: { tenantId: user.tenantId } });
  return NextResponse.json({ items });
}
```

### HTTP operations — parallel, not queued
All external API calls (WhatsApp, Stripe) use `Promise.all()` for parallelism.
Never use sequential `for` loops for independent I/O operations.
Long-running operations run synchronously in the request handler — Vercel Pro
supports 60s timeouts, which is sufficient for all our workloads.

### CRM connectors — develop without sandboxes
CRM connectors live in `lib/schemas/crm/` as Zod-typed interfaces. All implementations
are faked (`CRM_MODE=fake`) until real sandbox credentials are available.

### Testing
- **Unit tests** (Vitest): pure logic, services with mocked deps. Co-located.
- **Twilio is always mocked** in tests.
- **CRM is always faked** in tests.
- A change is not done until `pnpm typecheck && pnpm lint && pnpm test` all pass.

### Git
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional Commits: `feat: add churn detector`.
- No commits to `main` directly. PRs only.
- **After every verified change:** commit the changes with a descriptive message and
  `git push`. Pushing to `main` triggers an automatic Vercel deployment. Do not leave
  uncommitted changes sitting in the working tree — push immediately once the change
  is confirmed working (typecheck, lint, tests pass).

---

## 7. Environment Variables

**`apps/web/.env.local`**
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key
- `CLERK_SECRET_KEY` — Clerk secret key
- `TWILIO_MODE` — `live` | `mock` (default `mock` in dev)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` — Twilio credentials
- `STRIPE_MODE` — `live` | `mock` (default `mock` in dev)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe credentials
- `CRM_MODE` — `live` | `fake` (default `fake`)
- `DOOR_WEBHOOK_SECRET` — HMAC secret for door event webhooks
- `BILLING_PROVIDER_MODE` — `mock` | `stripe` | `telr`
- `DATA_REGION` — default `me-south-1`

---

## 8. Things That Will Bite You

- **WhatsApp sandbox**: recipients must first send a join code to the Twilio sandbox number.
- **WhatsApp templates**: production messages outside the 24-hour window require pre-approved
  Meta templates.
- **Phone number normalisation**: store as E.164 (`+9715…`). UAE CRMs are inconsistent.
- **Ramadan logic**: suppresses non-essential outbound messages between Fajr and Iftar.
- **Vercel function timeout**: 60s on Pro plan. All operations must complete within this window.
  Use `Promise.all()` for parallelism — never sequential I/O loops.

---

## 9. Phase Status

- [x] **Phase 1–10** — All features built (NestJS era).
- [x] **Phase 11** — Vercel migration: NestJS removed, direct Prisma in Next.js route handlers,
  Redis/BullMQ replaced with parallel operations, Docker removed, deployed on Vercel.
