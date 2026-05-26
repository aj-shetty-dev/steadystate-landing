# SteadyState

The intelligence layer for UAE gym operators. Read [`AGENTS.md`](./AGENTS.md) for the full
architecture and conventions. This README only covers human setup.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.19 | https://nodejs.org or `nvm install 20` |
| pnpm | ≥ 9.0 | `npm i -g pnpm@9` |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Git | any recent | `xcode-select --install` on macOS |

## First-time setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Start Postgres + Redis (requires Docker running)
pnpm db:up

# Generate Prisma client + run migrations
pnpm db:generate
pnpm db:migrate

# (Optional) seed a demo tenant
pnpm db:seed
```

## Running

```bash
# Everything in parallel
pnpm dev

# Or per-app
pnpm --filter @steady-state/api dev   # http://localhost:4000
pnpm --filter @steady-state/web dev   # http://localhost:3000
```

## Quality gate

Before opening a PR or claiming "done":

```bash
pnpm typecheck
pnpm lint
pnpm test
```

E2E tests require Postgres + Redis to be up and a `steady_state_test` database (the
Docker Compose setup creates this automatically):

```bash
pnpm --filter @steady-state/api test:e2e
```

## Repository layout

```
apps/
  api/           NestJS backend (Prisma, Auth, Twilio, future CRM connectors)
  web/           Next.js 15 dashboard (App Router, Tailwind)
packages/
  shared-types/  Zod schemas + TS types shared between api and web
```

## Phase 1 — What's shipped

- [x] Monorepo (Turborepo + pnpm + TypeScript strict)
- [x] NestJS API with Zod-validated env, Prisma, Helmet, CORS, global validation
- [x] PostgreSQL schema: tenants, users, members, CRM connections, WhatsApp messages
- [x] Auth: signup, login, JWT access + refresh tokens, `/me` endpoint
- [x] WhatsApp service with **Twilio** live + **mock** providers (toggled via `TWILIO_MODE`)
- [x] Health endpoint with DB ping
- [x] Tests: unit (Vitest) + e2e (Jest + Supertest)
- [x] Next.js dashboard skeleton

See `AGENTS.md` for the full phase plan.

## License

Proprietary — © 2026 Nuviq, Dubai, UAE.
