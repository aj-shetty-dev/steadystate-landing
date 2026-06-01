.DEFAULT_GOAL := help
.PHONY: help dev web install typecheck lint test build clean \
        db-generate db-push db-migrate db-studio

# ── colours ─────────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── dev server ─────────────────────────────────────────────────────────────
dev: ## Start Next.js app on :3000
	pnpm --filter @steady-state/web dev

vercel-dev: ## Run vercel dev (from apps/web)
	cd apps/web && vercel dev

web: dev ## Alias for dev

# ── quality ──────────────────────────────────────────────────────────────────
typecheck: ## Run TypeScript
	pnpm --filter @steady-state/web typecheck

lint: ## Run ESLint
	pnpm --filter @steady-state/web lint

test: ## Run Vitest
	pnpm --filter @steady-state/web test

check: typecheck lint test ## Run full quality gate

# ── build ────────────────────────────────────────────────────────────────────
build: ## Production build
	pnpm --filter @steady-state/web build

# ── database ─────────────────────────────────────────────────────────────────
db-generate: ## Regenerate Prisma client
	pnpm --filter @steady-state/web exec prisma generate

db-push: ## Push schema directly to DB (dev iteration)
	pnpm --filter @steady-state/web exec prisma db push

db-migrate: ## Create + apply a new migration
	pnpm --filter @steady-state/web exec prisma migrate dev

db-studio: ## Open Prisma Studio
	pnpm --filter @steady-state/web exec prisma studio

# ── housekeeping ─────────────────────────────────────────────────────────────
install: ## Install all dependencies
	pnpm install

clean: ## Remove build artefacts and caches
	pnpm clean
