# Copilot Instructions — SteadyState

**Always read `AGENTS.md` at the repo root before doing anything.** It contains the full architecture,
conventions, and phase status. This file lists only quick rules to keep responses tight.

## Quick rules

- TypeScript strict everywhere. No `any`. Use Zod for runtime validation.
- Multi-tenancy: every Prisma query on a tenant-scoped model MUST filter by `tenantId`.
- Twilio is mocked in tests. CRMs are faked (`CRM_MODE=fake`) until real credentials exist.
- Async/3rd-party work goes through BullMQ queues, not inline in HTTP handlers.
- Files >300 lines = split. No barrel files. No comments stating the obvious.
- Tests live next to source: `*.spec.ts` (unit), `*.e2e-spec.ts` (e2e).
- Quality gate before declaring work done: `pnpm typecheck && pnpm lint && pnpm test`.
- Use `pnpm --filter @steady-state/api …` to run app-scoped commands.
- Env access only via `apps/api/src/config/env.config.ts` (Zod-validated). Never `process.env.X` in business code.

## CRM development (no sandbox accounts)

For each provider, build two implementations against a `CrmConnector` interface:
- `*HttpConnector` — real HTTP from official docs.
- `*FakeConnector` — in-memory fixtures matching the Zod schemas in `packages/shared-types/src/crm/<provider>/`.

Tests and local dev always use the fake. Switching is driven by `CRM_MODE`.

## When in doubt

Re-read `AGENTS.md`. If still stuck, leave a `TODO(human):` comment and stop — don't guess at user
intent or invent API contracts.
