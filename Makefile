.DEFAULT_GOAL := help
.PHONY: help dev api web install typecheck lint test build clean \
        db-generate db-push db-migrate db-seed db-studio shared-types

# ── colours ─────────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── shared-types ─────────────────────────────────────────────────────────────
shared-types: ## Build shared-types package (required before first dev run)
	pnpm --filter @steady-state/shared-types build

# ── dev servers ─────────────────────────────────────────────────────────────
dev: shared-types ## Build shared-types then start API (4000) + web (3000)
	pnpm dev

api: shared-types ## Build shared-types then start only the NestJS API on :4000
	pnpm --filter @steady-state/api dev

web: ## Start only the Next.js dashboard on :3000
	pnpm --filter @steady-state/web dev

# ── quality ──────────────────────────────────────────────────────────────────
typecheck: ## Run TypeScript across all packages
	pnpm typecheck

lint: ## Run ESLint across all packages
	pnpm lint

test: ## Run Vitest unit tests
	pnpm test

check: typecheck lint test ## Run full quality gate (typecheck + lint + test)

# ── build ────────────────────────────────────────────────────────────────────
build: ## Production build (api + web)
	pnpm build

# ── database ─────────────────────────────────────────────────────────────────
db-generate: ## Regenerate Prisma client after schema changes
	pnpm --filter @steady-state/api exec prisma generate

db-push: ## Push schema directly to DB (dev/quick iteration — no migration file)
	pnpm --filter @steady-state/api exec prisma db push

db-migrate: ## Create + apply a new migration (prompts for a name)
	pnpm --filter @steady-state/api exec prisma migrate dev

db-studio: ## Open Prisma Studio (browser DB explorer)
	pnpm --filter @steady-state/api exec prisma studio

db-seed: ## Seed the database
	pnpm --filter @steady-state/api db:seed

# ── housekeeping ─────────────────────────────────────────────────────────────
install: ## Install all dependencies
	pnpm install

clean: ## Remove build artefacts and caches
	pnpm clean
