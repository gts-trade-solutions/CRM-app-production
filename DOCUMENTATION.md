# SalesForce CRM — Application Documentation

The production-architecture reference: how the system is built, how
authorization works, what every module does, and where the boundaries are.
(Setup and scripts live in `README.md`; delivery status in
`EXECUTION_PLAN.md`.)

---

## 1. System architecture

```
Browser (React 18, App Router pages — all client components today)
  │  typed hooks: lib/api/hooks.ts, lib/api/crm-hooks.ts (React Query 5)
  │  offline outbox: lib/api/outbox.ts (localStorage queue, idempotency keys)
  │  SSE: EventSource → /api/notifications/stream
  ▼
Route handlers  app/api/**  (the entire backend)
  │  requireUser() — NextAuth JWT session → active user   (lib/server/auth.ts)
  │  visibleUserIdsFor() — hierarchy subtree, server-side (lib/server/rbac.ts)
  │  hasCapability() — role × capability matrix           (lib/policy.ts)
  │  zod validation, pagination, serializers              (lib/server/api.ts, serialize.ts)
  │  domain services in transactions                      (lib/server/convert.ts, deals.ts)
  ▼
Prisma 6 → MySQL 8   (money = paise BigInt; cuid ids; scoped-query indexes)
```

Cross-cutting:

- **middleware.ts** — per-IP API rate limits (sign-in 10/min, writes
  60/min, reads 300/min) with `Retry-After`.
- **next.config.js** — CSP, HSTS, nosniff, DENY framing, strict referrer,
  Permissions-Policy (mic + geolocation first-party only).
- **PWA** — `public/sw.js` (production-only registration): cache-first
  static assets, network-first navigations with cached fallback and an
  `/offline` page; API requests are never intercepted — offline *writes*
  belong to the outbox, which replays with idempotency keys the server
  dedupes via `Lead.idempotencyKey`.

### Conventions

| Concern | Convention |
|---|---|
| Money | Paise as `BigInt` in the DB; whole rupees (number) on the wire; `Intl` en-IN formatting in the UI |
| Dates | `DateTime` in DB, ISO strings on the wire, local display via date-fns |
| Identity | `requireUser()` in every handler; the dev-only `x-user-id` header fallback is dead code in production |
| Errors | JSON `{error}` with correct status; UI toasts mutation errors; `error.tsx`/`not-found.tsx`/403 panels |
| Audit | Server-authored `AuditEvent` rows on every significant mutation; surfaced on the dashboard |

---

## 2. Authorization

Two independent layers, both server-enforced:

**Data scope (lib/server/rbac.ts).** A user sees records owned by
themself plus everyone below them in the `managerId` tree (admins see all).
Every list/detail/mutation query filters `ownerId ∈ visible`. The org:
Sales Head → Regional Managers → Team Leads → Sales Reps.

**Capabilities (lib/policy.ts).** One role × capability matrix consumed by
the UI (nav groups, guards, buttons) *and* imported by route handlers:

| Capability | Rep | TL | RM | Admin |
|---|---|---|---|---|
| view_admin / manage_org / manage_products / set_targets / manage_pipeline | — | — | — | ✅ |
| view_team / manage_users / manage_campaigns / reassign_records / archive_records / assign_activities | — | ✅ | ✅ | ✅ |
| view_reports / view_campaigns / export_csv | ✅ | ✅ | ✅ | ✅ |

Post-login routing: reps land on **My Day**; managers and admin on the
dashboard.

**Authentication:** NextAuth credentials over `User.passwordHash`
(bcrypt), JWT sessions carrying `{id, role}`; inactive users are rejected
at sign-in. All seeded users: `demo123` (invite/reset flow pending).

---

## 3. Data model (prisma/schema.prisma)

Core: **User** (hierarchy, active flag) · **Lead** (source→channel,
status, score inputs, attachments, campaign, consent/erasure stamps,
idempotency key) · **Contact** (person; optional Account + origin-lead
links) · **Account** (company; contacts/deals roll up) · **Deal** (stage,
paise value, line items, quotes, close dates, lost reason,
outcome-logging columns) · **DealLineItem** (price snapshot) · **Product**
· **Quote** (numbered snapshot with GST + status) · **SalesActivity**
(kind, assignee vs creator, due/completed, geo lat/lng) · **Campaign**
(budget/spend paise) · **Notification** (recipient, href, read) ·
**Target** (monthly paise per user) · **AuditEvent** · **OrgSettings**
(singleton: identity, GSTIN, GST bps, terms, quote counter) ·
**StageSetting** (label + weight bps per stage).

Record lifecycle: enquiry → **Lead** (new→contacted→qualified) →
**convert** (one transaction: account matched case-insensitively or
created, contact created, Cold deal opened, lead flipped) → pipeline
stages (DB-labelled Cold/Warm/Hot) → **Order Secured/Lost** (closedAt,
notifications to owner + manager) → feeds targets, forecast, leaderboard,
campaign ROI.

---

## 4. API surface (all session-authenticated, RBAC-scoped)

| Area | Endpoints |
|---|---|
| Identity | `GET /api/me`, `/api/auth/*` (NextAuth) |
| Leads | `GET/POST /api/leads` (filters, pagination, auto-assign `__auto`, attachments, consent, idempotency), `GET/PATCH /api/leads/[id]`, `POST …/convert`, `POST/DELETE …/attachments`, `POST /api/leads/import`, `POST /api/leads/reassign` |
| Contacts / Accounts | `GET/POST` collections, `GET/PATCH` details (archive via PATCH), account rollups in SQL |
| Deals | `GET/POST /api/deals`, `GET/PATCH /api/deals/[id]` (stage via transactional service, line items, close date, archive), `POST …/quotes`, `PATCH /api/quotes/[id]` |
| Activities | `GET/POST /api/activities` (mine/team/record-timeline; delegation notifies), `PATCH /api/activities/[id]` |
| Notifications | `GET/POST /api/notifications`, `GET /api/notifications/stream` (SSE) |
| Aggregates | `GET /api/stats/dashboard`, `GET /api/stats/reports?period=` |
| Team/Admin | `GET /api/team`, `POST /api/users`, `PATCH /api/users/[id]`, `POST …/deactivate` (transactional handover), `PUT /api/targets`, `GET/PATCH /api/settings`, `GET/POST /api/products`, campaigns `GET(?metrics=1)/POST/PATCH` |
| Quality/Privacy | `GET/POST /api/dupes` (groups + same-kind merge), `GET/POST /api/privacy` (export / admin erasure) |
| Misc | `GET /api/search`, `GET /api/health` |

---

## 5. Modules

- **Landing & login** — public front door; credentials form + demo persona
  grid; role-based redirect.
- **Dashboard** — SQL-computed KPIs (leads split online/offline,
  conversion, open pipeline, secured revenue), monthly-target progress,
  completable "Needs attention" list, source/revenue/stage charts, audit
  feed, per-role onboarding checklist.
- **My Day** — overdue/today/upcoming/completed buckets; managers get a
  team tab and schedule-or-assign (assignees notified; "Assigned by"
  badges); sidebar badge counts due items app-wide. A task may cover
  several leads at once (`ActivityTarget`): the row shows `2/5 spoken to`
  and expands into a per-lead checklist, the parent completes exactly when
  the last lead is ticked, and each lead's own timeline ticks only its own
  entry. Every dated task is downloadable as `.ics` and appears in the
  user's calendar subscription.
- **Leads** — server-paginated list with debounced search, status/channel
  filters, score badges (source quality + value + freshness + engagement
  from real activity counts), paperclip indicators, bulk reassign; detail
  workspace with qualification, attachments (inline previews), timeline,
  WhatsApp/email/dictation, privacy menu, atomic convert landing on the
  new deal.
- **Contacts & Accounts** — person/company split; account auto-linking at
  conversion; detail pages with deals, timelines, edit/archive.
- **Pipeline** — optimistic kanban over DB stage labels; deal workspace
  (stepper, line items → value, quotes with statuses, editable close
  date); print-ready GST quotation from OrgSettings.
- **Campaigns** — auto-computed funnel (leads → converted → pipeline →
  secured) vs manually edited budget/spend; ROI vs spend-or-budget.
- **Reports** — stage-weighted forecast (weights from admin settings),
  period-filtered leaderboard/source performance/lost reasons, channel
  trend, CSV exports (paginated fetch of the full scope).
- **Team** — reporting chain, subtree with stats and roll-up attainment,
  role-gated add-member (server validates role/manager levels).
- **Admin** — Users (edit, deactivate + handover), Targets, Products,
  Organisation (feeds quotations), Pipeline vocabulary/weights, Data
  Quality (duplicate groups + transactional merge with survivor choice).

---

## 6. Field capabilities

| Capability | Implementation |
|---|---|
| Offline capture | Outbox in localStorage → idempotent replay on `online`; queued badge app-wide; server dedupe by key |
| Offline browsing | Service worker (production builds): visited pages from cache, `/offline` fallback |
| Geo check-in | Browser geolocation on activity logging → Google Maps link on timelines |
| Voice dictation | Web Speech API (en-IN) on activity notes and email bodies; hidden when unsupported |
| WhatsApp | `wa.me` deep links with context-prefilled messages (10-digit numbers get 91) |
| Auto-assignment | `__auto` picks the visible active rep with the fewest open leads |
| Calendar sync | Per-user iCalendar feed at `/api/calendar/<token>` (RFC 5545, CRLF, 75-octet folding, 30-min `VALARM`, `REFRESH-INTERVAL` 30 min). Added once to Google/Apple/Outlook; the client re-polls, so later tasks and reschedules arrive on their own. Stable `UID` per activity means edits update rather than duplicate. The token is the only credential — 32 random bytes, rotatable from My Day, `no-store`, and a rotation 404s every calendar still on the old URL |
| Multi-lead tasks | One activity, one `ActivityTarget` per lead; parent completion is derived from the targets, never set directly |

---

## 7. Security & privacy

- **Credentials**: no account is ever created with a password. A new member
  is written with `passwordHash: null` — which `verifyCredentials` treats as
  "cannot sign in", whatever is guessed — and emailed a single-use link to
  choose their own. Only the SHA-256 of that token is stored, so a database
  leak cannot be replayed into account takeover; acceptance is a
  compare-and-set on the hash, making the link single-use under concurrency.
  Re-inviting issues a new token (revoking the old one) and is refused once
  the member has a password, so a manager cannot take over a colleague's
  account. The first administrator, who has nobody to invite them, comes
  from `npm run bootstrap:admin`, which refuses to run twice.
- **Demo mode** (`NEXT_PUBLIC_DEMO_MODE`): off unless explicitly `"true"`.
  It gates the login page's persona grid and the seed script — which wipes
  the database, so the flag is what stands between a mistyped command and
  production data loss.
- **Headers**: CSP (no eval in production), HSTS, nosniff, DENY framing,
  strict referrer, Permissions-Policy (mic/geo self-only).
- **Rate limits** (middleware, per IP): sign-in 10/min, writes 60/min,
  reads 300/min → 429 + `Retry-After`.
- **DPDP**: consent checkbox → `consentAt` stamp; per-record JSON export
  (record + attachments meta + activity history); admin-only audited
  erasure that anonymizes PII, deletes attachments and scrubs activity
  notes while preserving business aggregates (`erasedAt` marker).
- **Audit**: server-written events for creates, conversions, stage wins/
  losses, imports, reassignments, member lifecycle, merges, erasures.

---

## 8. Testing & CI

- **Unit (26)** — policy matrix, hierarchy visibility, lead scoring, rate
  limiter, CSV/WhatsApp/INR utilities. No database required.
- **Integration (18)** — against real MySQL: server RBAC subtrees,
  transactional conversion (atomicity, account dedupe, double-convert
  rejection), credential verification (incl. deactivated users), deal
  stage services (notifications, reopen semantics, line-item value,
  closed-deal immutability), erasure semantics.
- **CI** — GitHub Actions with a MySQL 8 service container: schema push →
  seed → typecheck → lint → unit → integration → production build.

## 9. Current boundaries

1. **Files/email**: attachments store inline previews (small images) or
   metadata; email is composer-logged, not sent — both switch to S3/SES
   when AWS credentials are configured.
2. **Invites**: new members receive the demo password; invite/reset-
   password flow is the next auth increment.
3. **Single-node assumptions**: in-memory rate limiter and SSE; move to
   Redis/pub-sub when scaling horizontally.
4. **Pages are client components** — data protection is fully server-side;
   a server-component pass is a performance (not security) optimization.
5. Remaining go-live items are tracked in `EXECUTION_PLAN.md` (M4/M5):
   approvals, accessibility audit, load test, backup/restore runbook.
