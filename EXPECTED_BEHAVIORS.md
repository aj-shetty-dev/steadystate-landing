# Expected Behaviors — SteadyState

Living inventory of expected functionality across the platform. Update as features are added or rules change.

---

## Members

- [x] A member can be created with fullName (required), phone (optional, E.164), email (optional), gender, dateOfBirth, emergencyContact, medicalNotes, preferredLocale, assignedTrainerId
- [x] Phone must be unique per tenant — attempting to create a member with an existing phone shows "A member with this phone number already exists"
- [x] Phone must be in E.164 format (e.g. `+971501234567`) — invalid format shows validation error
- [x] A member can be edited (name, phone, email, locale, trainer, notes, etc.)
- [x] A member can be deactivated — this cancels all active/frozen/pending memberships with reason "Member deactivated" and cancels all future bookings
- [x] Deactivated members appear with CANCELLED status in the list
- [x] Members can be searched by name, email, or phone
- [x] Members can be filtered by membership status (ACTIVE, EXPIRED, FROZEN, CANCELLED, PENDING, PENDING_PAYMENT)
- [x] The member list is paginated
- [x] Clicking a member row navigates to `/members/[id]` showing full profile
- [x] Member profile shows: avatar initials, name, status badge, email, phone, provider, locale, source, join date, membership expiry
- [x] Member profile shows active membership card with plan name, status, start/end dates, price, and available actions
- [x] Member profile shows membership history (past memberships)
- [x] Member profile shows upcoming and past class bookings
- [x] Member profile shows recent check-ins (last 10)
- [x] Member profile shows recent invoices (last 10)
- [x] Members can be bulk-imported via CSV (preview before applying)

## Memberships

- [x] A membership can be created for a member with a selected plan, start date, and initial status
- [x] One member can have more than one membership (different plans or non-overlapping periods)
- [x] Attempting to create an overlapping membership (same member + same plan + overlapping dates) shows "Member already has an overlapping active or pending membership"
- [x] A membership in PENDING_PAYMENT status can be activated (Mark paid / Activate)
- [x] A CANCELLED or EXPIRED membership cannot be activated — shows "Cannot activate a CANCELLED/EXPIRED membership"
- [x] An ACTIVE membership can be frozen with a date range and optional reason
- [x] Freeze end date must be after start date
- [x] Total freeze days must not exceed the plan's maxFreezeDays — shows "Freeze quota exceeded: requested X, used Y, allowed Z"
- [x] Overlapping freezes for the same membership are blocked — shows "A freeze already exists for this period"
- [x] A FROZEN membership can be unfrozen — restores ACTIVE status
- [x] A membership can be cancelled with a reason
- [x] A FROZEN membership cannot change plan — shows "Unfreeze the membership before changing plan"
- [x] CANCELLED or EXPIRED memberships cannot change plan — shows appropriate error
- [x] Plan change cancels the current membership and creates a new one on the new plan
- [x] Memberships can be searched by member name
- [x] Memberships can be filtered by status
- [x] Upcoming renewals are visible
- [x] Membership plans can be created with name (EN/AR), description, duration, price, VAT rate, class inclusion, and max freeze days
- [x] Membership plans can be archived (soft delete) if no upcoming usage depends on them

### Membership lifecycle automation

- [x] Memberships past their end date are auto-expired (daily cron)
- [x] Auto-renewals are created 7 days before expiry (daily cron)
- [x] Expiry reminders are sent 7 days before expiry (WhatsApp, once only)
- [x] Renewal reminders are sent 3 days before renewal start (WhatsApp)

## Classes

- [x] A class type can be created with name (EN/AR), description, duration, capacity, color, equipment requirement, and drop-in price
- [x] A class type can be edited
- [x] A class type can be archived — blocked if upcoming sessions exist: "Cannot archive: X upcoming sessions scheduled"
- [x] A class session can be created (one-off) with class type, instructor, start/end time, room, and capacity override
- [x] A recurring class schedule can be created (days of week, time range, valid from/to) — sessions are auto-generated up to 30 days ahead
- [x] A recurrence can be deactivated
- [x] A session can be rescheduled (only SCHEDULED sessions) — notifies all booked/waitlisted members
- [x] A session can be cancelled — cancels all bookings and notifies affected members
- [x] Sessions can be filtered by status (SCHEDULED, CANCELLED, COMPLETED), class type, date range, instructor, room
- [x] Session detail shows capacity (booked / capacity) and list of bookings

## Class Bookings

- [x] A member can be booked into a SCHEDULED session
- [x] Cannot book into a past session — shows "Cannot book a session that has already started"
- [x] Cannot book into a non-SCHEDULED (CANCELLED/COMPLETED) session — shows "Cannot book a [status] session"
- [x] Cannot double-book the same session — shows "Already booked"
- [x] If a member is FROZEN and the freeze overlaps with the session time — shows "Member is on freeze during this session"
- [x] Member must have an ACTIVE membership or the class must have a drop-in price configured
- [x] If the session is at capacity, the booking goes to WAITLISTED with a position number
- [x] When a booked member cancels, the first WAITLISTED member is auto-promoted to BOOKED and receives a WhatsApp notification: "A spot opened up in [class] on [date] — you're now confirmed."
- [x] A booking can be cancelled — sets status to CANCELLED
- [x] A booking can be checked in — sets status to CHECKED_IN
- [x] Bookings appear on the member profile page (upcoming vs past)

## Check-Ins

- [x] A member can check in via kiosk PIN, kiosk QR code, door event, manual entry, or mobile QR
- [x] Kiosk PIN auth validates a 4-8 digit PIN against staff records
- [x] Member can be identified by member ID, phone number, or QR token
- [x] Phone lookup handles number normalization (`, 00`, local `0` → `+971`)
- [x] A CANCELLED or EXPIRED member cannot check in — shows "Member's membership is [status]; cannot check in. Renew first."
- [x] Duplicate check-in within 5 minutes is blocked — shows "Duplicate check-in: member already checked in within the last 5 minutes"
- [x] If the member has a BOOKED class session within 30 minutes of check-in, the check-in auto-links to that session
- [x] Staff performing the check-in must be active
- [x] Check-in updates member.lastCheckinAt
- [x] Recent check-ins are listed in the check-ins log page
- [x] Check-in history appears on the member profile page

## Staff

- [x] A staff member can be created with fullName, email, phone, role (TRAINER/RECEPTION/MANAGER/CLEANER/OTHER), hourly rate, commission %, color
- [x] A staff member can be edited
- [x] A staff member can have a PIN set (4-8 digits, bcrypt-hashed)
- [x] PIN must be unique per tenant — shows "PIN already in use by another staff member"
- [x] A staff member can be deactivated (terminated)
- [x] A staff member can be reactivated
- [x] Staff must be active to be used in check-ins, class instruction, POS sales, or shifts
- [x] Staff list shows all staff including inactive
- [x] Each staff row shows: name, role, contact info, rate/commission, hire date, status

## Leads

- [x] A lead can be created with fullName (required), phone, email, source (WALK_IN, REFERRAL, INSTAGRAM, FACEBOOK, GOOGLE, WEBSITE, WHATSAPP, OTHER)
- [x] A lead can be edited
- [x] Lead stage transitions follow strict rules:
  - NEW → CONTACTED, TRIAL_BOOKED, TRIAL_COMPLETED, LOST
  - CONTACTED → TRIAL_BOOKED, TRIAL_COMPLETED, LOST
  - TRIAL_BOOKED → TRIAL_COMPLETED, CONTACTED, LOST
  - TRIAL_COMPLETED → CONTACTED, LOST
  - LOST → NEW (can be revived)
  - CONVERTED is terminal (via convert endpoint only)
- [x] Invalid stage transition shows "Invalid stage transition [from] → [to]"
- [x] Adding an activity to a NEW lead auto-transitions it to CONTACTED
- [x] Leads stale for 14 days (no updates, in NEW or CONTACTED) auto-transition to LOST
- [x] A lead can be converted to a member — shows phone conflict error if the phone already exists: "Member with phone [phone] already exists"
- [x] Converted lead cannot be converted again — shows "Lead already converted"
- [x] Convert creates a new member with source=LEAD_CONVERSION and optional PENDING_PAYMENT membership
- [x] Leads can be filtered by stage and assigned user

## POS (Point of Sale)

- [x] A sale can be created with line items: PRODUCT, CLASS_DROPIN, MEMBERSHIP, or DAY_PASS
- [x] PRODUCT lines require a product ref — resolves price and VAT from the product catalog
- [x] MEMBERSHIP lines require a plan ref — resolves price from the plan
- [x] CLASS_DROPIN lines require a class type with dropInPriceAed set
- [x] DAY_PASS lines require an explicit unit price
- [x] VAT is computed per line and aggregated
- [x] Sale can be linked to a member (optional) and/or staff member (optional)
- [x] A Stripe PaymentIntent can be created for a sale (idempotent)
- [x] A paid sale can be refunded (full or partial)
- [x] Only PAID or PARTIALLY_REFUNDED sales can be refunded — "Only paid sales can be refunded"
- [x] Refund amount cannot exceed remaining (total minus already refunded) — "Refund exceeds remaining amount"
- [x] Recent sales are listed (last 50)
- [x] Daily totals are displayed
- [x] Sales history can be filtered by member, staff, date range

## Shop (In-App Store)

- [x] A product can be created with SKU, name (EN/AR), description, price, VAT rate, and image
- [x] SKU must be unique per tenant — shows "SKU already exists"
- [x] A product can be edited
- [x] A product can be deactivated (soft delete via active flag)
- [x] An order can be placed by a member with line items (product ID + quantity)
- [x] All products in an order must exist and be active — "One or more products are unavailable"
- [x] Orders start as PENDING and can be marked PAID
- [x] Only PENDING orders can be marked PAID — "Order is [status]; only PENDING orders can be marked PAID"

## Billing / Invoices

- [x] An invoice can be created with member, amount, VAT, currency, due date, and description
- [x] Only DUE invoices can be edited — "Only DUE invoices can be edited"
- [x] An invoice can be voided (written off) if not yet PAID — "Cannot void a paid invoice"
- [x] A Stripe payment link can be generated for an invoice
- [x] Cannot generate payment link for an already-paid invoice — "Invoice already paid"
- [x] Failed invoices can be scheduled for retry within the salary window (configurable, default 25th-28th monthly)
- [x] Payment retries process with WhatsApp reminders
- [x] Invoice list is paginated, searchable, and filterable by status
- [x] Salary window is configurable per tenant (start day, end day, timezone, jitter)

## WhatsApp / Messaging

- [x] A WhatsApp message can be sent to an individual member
- [x] Messages can be broadcast to segmented members (by status, plan, last check-in range)
- [x] Messages track lifecycle: QUEUED → SENT → DELIVERED/READ (or FAILED/UNDELIVERED)
- [x] Failed messages can be resent — "Only failed messages can be resent"
- [x] Message log is paginated, searchable, and filterable by status and date range
- [x] Notifications are bilingual (EN/AR) based on member's preferredLocale
- [x] Non-essential outbound WhatsApp is suppressed during Ramadan fasting hours (Fajr to Iftar, Dubai time)

## Automation (Churn Engine)

- [x] Churn detection scans ACTIVE members idle for more than the threshold (default 14 days)
- [x] Members who have never checked in are evaluated from their join date
- [x] Members already nudged within the cooldown period (default 7 days) are skipped
- [x] Detected churn signals can be nudged via WhatsApp
- [x] Ramadan: WhatsApp nudges suppressed during fasting hours
- [x] Churn signals are listed with status (PENDING, NUDGED, DISMISSED, FAILED)

## Door Events

- [x] Door events are ingested via webhook authenticated with HMAC-SHA256 signature
- [x] Missing/invalid signature shows "Missing X-Door-Signature header" or "Invalid signature"
- [x] After-hours entry (23:00–06:00 Dubai time) generates an AFTER_HOURS_ENTRY signal
- [x] Entry without a matched member generates a TAILGATE_SUSPECTED signal
- [x] Recent door signals and events are listed on the door monitoring page

## Reports

- [x] Revenue report: grand total, POS sales (count, total, VAT), invoice totals — trailing period
- [x] Member growth report: new members, churned members, net growth, active count
- [x] Class utilization report: per class type — sessions, total booked, total capacity, fill rate %, attendance rate %
- [x] Staff sales commission report: per staff — name, role, sales count, total AED

## Dashboard / Overview

- [x] Shows total member count and active member count
- [x] Shows revenue month-to-date (AED)
- [x] Shows classes scheduled today
- [x] Shows open leads count (not converted or lost)
- [x] Shows churn signals in last 30 days (pending, nudged, failed)
- [x] Shows WhatsApp stats for last 30 days (total, sent, failed)

## Kiosk

- [x] Staff can authenticate with PIN at the kiosk
- [x] Invalid PIN shows "Invalid PIN"
- [x] Members can check in at the kiosk via PIN, QR, or phone lookup

## Member Portal (Member-Facing API)

- [x] Members can view their profile (`GET /m/me`)
- [x] Members can view upcoming classes (`GET /m/classes/upcoming`)
- [x] Members can view and manage their bookings (`GET /m/bookings`, `POST /m/bookings`)
- [x] Members can view their QR code for check-in (`GET /m/qr`)
- [x] Members can view their check-in history (`GET /m/checkins`)
- [x] Members can view their invoices (`GET /m/invoices`)
- [x] Members can view their notifications (`GET /m/notifications`)

## Subscription / Tenant

- [x] New tenant signup creates tenant + user + 14-day trial subscription (STARTER plan)
- [x] Onboarding via Clerk creates tenant + user + optional demo seed data
- [x] Subscription lifecycle: TRIALING → ACTIVE → PAST_DUE → CANCELLED → EXPIRED
- [x] Stripe checkout session for upgrading/paying
- [x] Stripe customer portal for managing billing
- [x] Mock mode available for development
- [x] Super admin can view all tenants with member counts and subscription status

## General / Cross-Cutting

- [x] Authentication required for all dashboard pages — unauthenticated users redirect to `/onboarding`
- [x] Super admin only can access `/admin` — non-super-admin redirects to `/overview`
- [x] All API routes are proxied through the Next.js app to the NestJS backend
- [x] Light/dark theme support via CSS custom properties and `data-theme` attribute
- [x] Bilingual support (EN/AR) throughout — member communications use preferredLocale
- [x] All tables support loading skeletons while data fetches
- [x] Optimistic UI updates with loading states during mutations
- [x] Toast/error messages for failed operations
- [x] Confirm dialogs for destructive actions (deactivate, cancel, archive, void)
