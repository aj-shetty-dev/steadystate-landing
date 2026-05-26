# SteadyState — Functional Backlog

> Prioritised list of user-facing gaps. Each item is scoped so it can be picked up and
> shipped independently. Start at the top and work down.

---

## BLOCK 1 — Revenue & Operations (must-have for go-live)

### 1.1 POS Terminal Interface ✅

**What's broken:** The `/pos` page is a read-only sales log. A gym cannot charge a member for
anything from the dashboard. No cart, no checkout, no payment.

**Scope:**
- Product search + category browse (barcode lookup stretch goal)
- Cart: add/remove line items (PRODUCT, CLASS_DROPIN, MEMBERSHIP, DAY_PASS)
- Member lookup (name/phone) to attach sale to a member
- Checkout flow: subtotal → VAT → total → payment method
- Stripe Terminal / card-present integration (mock first, then live)
- Receipt view post-checkout
- Refund flow (full and partial) from sale detail
- Daily sales summary in the POS header (today's total, transaction count)

**Files to touch:** `apps/web/app/(dashboard)/pos/` (rewrite), `apps/api/src/pos/`,
`apps/api/src/payments/`

---

### 1.2 Staff CRUD in Dashboard ✅

**What's broken:** Staff page is a read-only table. Cannot add, edit, or deactivate staff.

**Scope:**
- Add staff form modal (fullName, email, phone, role, hourlyRate, commission%, color)
- Edit staff modal (same fields, pre-populated)
- Set / reset PIN for kiosk access
- Deactivate / reactivate staff
- Assign a User account to a Staff record (link for dashboard login)

**Files to touch:** `apps/web/app/(dashboard)/staff/`, `apps/api/src/staff/`

---

### 1.3 Interactive Leads Pipeline ✅

**What's broken:** Leads page is a frozen Kanban. Cannot add, move, or convert leads.

**Scope:**
- Add lead form (fullName, phone, email, source, notes)
- Drag-and-drop between stages (NEW → CONTACTED → TRIAL_BOOKED → TRIAL_COMPLETED → CONVERTED → LOST)
- Click a lead card → slide-out detail panel with activity timeline
- Log activity (call, WhatsApp, email, visit, note) with timestamp and summary
- Convert to member: one-click creates Member from Lead data
- Set / clear follow-up reminder with date picker
- Lead source attribution in reports (which channel produces conversions)

**Files to touch:** `apps/web/app/(dashboard)/leads/`, `apps/api/src/leads/`

---

### 1.4 Manual Messaging (Broadcast + 1:1) ✅

**What's broken:** Messages page is a read-only outbound log. No way to compose or send a
message to members.

**Scope:**
- Compose message form: recipient (single member or segment), body, template selection
- Segment picker: all active members, by plan, by membership status, by last check-in range
- Send now vs schedule for later
- Message status tracking (queued → sent → delivered → read → failed)
- Resend failed message
- Message history with filters (date range, status, recipient search)

**Files to touch:** `apps/web/app/(dashboard)/messages/`, `apps/api/src/whatsapp/`,
`apps/api/src/notifications/`

---

### 1.5 Billing & Invoice Management ✅

**What's broken:** Invoice page is read-only with two action buttons. Cannot create, edit, or
void invoices. No member-facing payment.

**Scope:**
- Manual invoice creation (member select, line items, due date)
- Edit draft invoice / void invoice
- Invoice PDF generation (download + share via WhatsApp)
- Payment link generation (member pays via Stripe checkout)
- Dunning status view: see retry schedule, override, write-off
- Salary window configuration page (start day, end day, timezone, jitter)
- Revenue reconciliation view (POS + invoices vs expected)

**Files to touch:** `apps/web/app/(dashboard)/billing/`, `apps/api/src/billing/`,
new PDF generation service

---

## BLOCK 2 — Member Experience (must-have for retention)

### 2.1 Member Web Portal / PWA

**What's broken:** The member portal API (`/m/*`) exists and works. There is zero member-facing
UI. No mobile app, no PWA, no web portal.

**Scope:**
- New Next.js app or route group: `apps/web/app/m/` (member-facing, separate layout)
- Clerk-powered member auth (sign up / sign in)
- Member home screen: membership card, expiry, QR check-in code
- Class schedule with calendar view + book/cancel
- My bookings (upcoming + history)
- My invoices with pay-now button
- My profile (view + edit name, phone, email, preferences)
- Check-in history
- PWA manifest + service worker for "add to home screen" on mobile
- Arabic locale toggle (EN ↔ AR)

**Files to touch:** New `apps/web/app/m/` route group, `apps/web/public/manifest.json`,
`apps/api/src/member-portal/`

---

### 2.2 Member Self-Service Endpoints (API gaps)

**What's broken:** Members can book a class via API but cannot cancel, pay, or edit their profile.

**Scope:**
- `DELETE /m/bookings/:id` — cancel a booking
- `PATCH /m/me` — update profile fields (phone, email, preferences, medical notes)
- `POST /m/invoices/:id/pay` — initiate payment for an invoice
- `POST /m/memberships` — purchase a membership plan (creates PENDING_PAYMENT membership + invoice)

**Files to touch:** `apps/api/src/member-portal/`

---

## BLOCK 3 — Operations Maturity (should-have)

### 3.1 Class Calendar View

**What's broken:** Classes are displayed as flat tables. No week/month calendar view.

**Scope:**
- Week view (primary): columns = days, rows = time slots, cards = sessions
- Month view (secondary): day cells with session count indicators
- Click a session → detail popover with booking count, instructor, room
- Color coding by class type
- Filter by class type, instructor, room
- Drag to create a session on the calendar

**Files to touch:** `apps/web/app/(dashboard)/classes/`

---

### 3.2 Waitlist + Cancellation Policies

**What's broken:** No waitlist auto-promotion. No late-cancel penalties.

**Scope:**
- Waitlist: when class is full, allow booking with WAITLISTED status
- Auto-promote: when a BOOKED member cancels, promote first WAITLISTED member to BOOKED + send WhatsApp notification
- Booking window config per class type (e.g., members can book max 7 days ahead)
- Late-cancel window config (e.g., cancel within 2 hours = penalty)
- Late-cancel penalty: charge drop-in fee or mark as no-show
- No-show tracking per member (visible on member detail)

**Files to touch:** `apps/api/src/classes/`, `apps/api/src/automation/` (new waitlist worker)

---

### 3.3 Shop Management UI

**What's broken:** Shop page shows products as read-only cards. Cannot add, edit, or manage products and orders.

**Scope:**
- Product CRUD: add/edit form modal (SKU, name EN/AR, description, price, VAT rate, image URL, active toggle)
- Product list with search, category filter, active/inactive filter
- Order management: view orders, mark as fulfilled, process refund
- Inventory tracking (stock count, low-stock alerts)
- Order detail view with member info, line items, timeline

**Files to touch:** `apps/web/app/(dashboard)/shop/`, `apps/api/src/shop/`

---

### 3.4 Check-in Experience

**What's broken:** Check-in page shows UUIDs instead of names. No manual check-in from dashboard.

**Scope:**
- Show member name, photo placeholder, membership status on each check-in row
- Manual check-in button: search member by name/phone → confirm → check in
- "Currently in gym" live counter (members checked in today, not yet checked out — if door events support direction)
- Peak hours chart (check-ins by hour of day, last 30 days)
- Kiosk mode: full-screen view designed for a tablet at the front desk

**Files to touch:** `apps/web/app/(dashboard)/checkins/`, `apps/api/src/checkin/`

---

## BLOCK 4 — Reporting & Insights (should-have)

### 4.1 Flexible Reporting

**What's broken:** All reports are hardcoded to trailing 30 days. No export.

**Scope:**
- Date range picker on every report (presets: 7d, 30d, MTD, QTD, YTD, custom)
- Compare periods (this month vs last month)
- Export to CSV on every report
- Export to PDF summary
- Dashboard-level global date filter (applies to overview + all reports)

**Files to touch:** `apps/web/app/(dashboard)/reports/`, `apps/web/app/(dashboard)/overview/`, `apps/api/src/reporting/`

---

### 4.2 New Reports

**Scope:**
- Member LTV report (average revenue per member, segmented by plan / join cohort)
- Churn rate over time (members lost per month, churn %)
- Lead conversion funnel (lead source → stage → conversion rate → time-to-convert)
- Class profitability (revenue from drop-ins + membership allocation − instructor cost)
- VAT return summary (UAE FTA format: total sales, VAT collected, VAT paid)
- Member engagement score (visits/month, classes attended, purchases, days since last visit)

**Files to touch:** `apps/web/app/(dashboard)/reports/`, `apps/api/src/reporting/`

---

## BLOCK 5 — UAE Market Readiness (must-have for UAE launch)

### 5.1 Arabic Dashboard UI

**What's broken:** The entire dashboard is English-only. Arabic-speaking staff cannot use it.

**Scope:**
- RTL layout support (Tailwind RTL variants, dir="rtl" on `<html>`)
- Arabic translations for all UI strings (sidebar, buttons, labels, errors, empty states)
- Locale switcher in sidebar (EN | AR), persisted to user preferences
- Arabic number formatting (Arabic-Indic digits where appropriate)

**Files to touch:** All dashboard pages, `apps/web/app/layout.tsx`, new i18n config

---

### 5.2 Arabic Message Templates

**What's broken:** Models have `nameAr`/`bodyAr` fields but no real Arabic content in templates.

**Scope:**
- Professionally written Arabic templates for: churn nudge, payment reminder, renewal notice, class booking confirmation, welcome message, birthday greeting
- Template management page (view, edit, test all templates in both languages)
- Ramadan-specific Arabic templates (Eid Mubarak greetings, Ramadan schedule changes)

**Files to touch:** `apps/api/src/automation/churn-nudge.template.ts`, new template management

---

### 5.3 Telr Payment Integration

**What's broken:** AGENTS.md lists Telr as the UAE payment provider. Only Stripe is implemented.

**Scope:**
- Telr provider implementing the same `StripeProvider`-style interface
- Hosted payment page flow (Telr redirects to their hosted page, returns with result)
- Webhook handler for Telr payment notifications
- Env-based toggle: `PAYMENT_PROVIDER=stripe|telr|mock`
- Dashboard settings page to configure Telr merchant ID + API key

**Files to touch:** `apps/api/src/payments/`, `apps/api/src/subscriptions/`

---

### 5.4 VAT Filing Report

**What's broken:** VAT is computed per transaction but there's no FTA-ready summary.

**Scope:**
- VAT return report formatted per UAE FTA requirements (VAT collected on sales, VAT paid on expenses)
- Date-range selectable (matches UAE tax periods: quarterly)
- Export as PDF + CSV
- Audit trail linking each VAT line to source transactions

**Files to touch:** `apps/api/src/reporting/`, `apps/api/src/shop/vat.ts`

---

## BLOCK 6 — Platform Hardening (nice-to-have)

### 6.1 Multi-Location Support

**Scope:**
- Add `Location` model (name, address, timezone, active)
- Every tenant-scoped model gains optional `locationId`
- Location switcher in dashboard header
- Cross-location reporting (aggregate + per-location breakdown)
- Staff, classes, members assignable to one or more locations
- Location-based dashboard filtering

---

### 6.2 CRM Sync Monitoring Dashboard

**Scope:**
- Per-connection detail page: last sync time, records synced, error log, sync frequency config
- Sync health indicators on the main CRM connections list
- Manual "sync now" button per connection
- Sync failure alerts (in-app notification + optional WhatsApp to operator)

---

### 6.3 Simple Logic + Elewix CRM Connectors

**Scope:**
- Fake connectors with UAE-realistic fixture data
- HTTP connectors built from official API docs (when available)
- Zod schemas for both providers in `packages/shared-types/src/crm/`

---

### 6.4 Operator Mobile App (React Native or PWA)

**Scope:**
- Quick-look dashboard: today's check-ins, classes, revenue
- Member look-up by name/phone
- Quick check-in (scan member QR or search)
- Push notifications for: churn alerts, payment failures, class at capacity

---

## Working Through This Backlog

1. Start with **Block 1** — these are the revenue-critical and operational must-haves.
2. Within each block, work top-to-bottom. Items are ordered by dependency and impact.
3. Each item is scoped to be shippable independently. Merge and deploy after each one.
4. Update this file by checking off items as they ship (change `### X.Y` to `### X.Y ✅`).
5. New gaps discovered during implementation get appended to the relevant block.

---

*Last updated: 2026-05-26*
