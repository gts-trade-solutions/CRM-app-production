# Production Roadmap — SalesForce MVP → Production v1

This document is the engineering plan for converting the demo MVP into a
production application. It has three parts: an honest audit of where the
current architecture falls short of production, a critical assessment of the
2026 strategy research (what to adopt now, what to defer), and a phased
delivery plan with acceptance criteria.

**Bottom line:** the MVP is a good *specification* — the domain model,
RBAC rules, and workflows are proven — but almost every layer beneath the UI
must be rebuilt for production. That was the deliberate MVP trade-off; the
bill now comes due. Realistic path to a production v1: **~12–14 weeks** for
1–2 engineers, in five phases.

---

## Part 1 — Architecture audit: why the current app is not production-ready

### 1.1 Critical (blocks any real deployment)

| # | Gap | Where | Consequence in production |
|---|---|---|---|
| C1 | **No backend / no database** — all data lives in one localStorage blob per browser | `lib/store.tsx` | No multi-user reality: two reps can't see each other's data, nothing survives a cleared cache, "hierarchy visibility" is a fiction between devices |
| C2 | **No real authentication** — login is a persona picker that writes an id to state | `app/login`, `components/app-shell.tsx` | Anyone is anyone. No sessions, no passwords, no route protection (guard is a client-side redirect) |
| C3 | **RBAC enforced only in the browser** — `visibleUserIds` filters what the UI *renders*, but every user's client holds the entire dataset | `lib/rbac.ts`, every page | Open DevTools → read the whole company's pipeline. Access control must be re-implemented server-side; the client version becomes a UX convenience only |
| C4 | **No transactional integrity** — lead conversion mutates leads, contacts, accounts and deals in one `setState`; a real system doing this across tables without a transaction produces orphans | `convertLead` in `lib/store.tsx` | The exact "ghost records" risk the research report calls out — valid concern, solved by a DB transaction |
| C5 | **Files stored in localStorage as data-URLs** | attachments in `lib/store.tsx` | ~5MB browser quota for the entire app state; a few photos kill persistence silently |
| C6 | **Not even a git repository** — no version control, no CI, no tests of any kind | repo root | No safety net for any of the above work |

### 1.2 Serious (would fail under real load or real users)

| # | Gap | Where | Notes |
|---|---|---|---|
| S1 | **Single global context re-renders everything** — every keystroke-level mutation rebuilds all subscribed pages; whole-state JSON serialization on every change | `lib/store.tsx` | Fine at 12 leads; collapses at 10,000. Production needs per-query caching (React Query/SWR) and server pagination |
| S2 | **All computation is client-side over full collections** — scoring, rollups, forecasts, leaderboards recompute in `useMemo` over every record | all pages | Must move to DB queries/aggregations with indexes |
| S3 | **Offline sync is simulated** — an `online` event flips a flag; no durable queue, no retry, no idempotency, no conflict handling | `lib/store.tsx` | Real field usage needs an IndexedDB outbox + service worker + idempotency keys server-side |
| S4 | **ID generation** — `Date.now()+Math.random()` | `lib/utils.ts` | Collision-prone across clients; DB should own IDs (cuid/uuid) |
| S5 | **Money as floating rupee numbers** | everywhere | Store paise as integers in the DB; format at the edge |
| S6 | **Notifications are rows in the same state blob** | `notifications-menu.tsx` | Real version: server-generated, delivered by polling/SSE, with read-state per user |
| S7 | **Audit trail is client-authored** — the activity feed is written by the browser | `pushActivity` | Trivially forgeable; audit events must be emitted server-side |
| S8 | **No error handling surface** — no `error.tsx`/`not-found.tsx` boundaries, no retry states, no empty-network states | `app/` | Every fetch in production can fail; the UI has no vocabulary for it |
| S9 | **Storage-version resets wipe data** — schema evolution via key bumps (v1→v6) | `STORAGE_KEY` | Correct for demos, unacceptable for real data; replaced by DB migrations |

### 1.3 Moderate (needed before scale/enterprise)

- No security headers (CSP, HSTS, frame-ancestors), no rate limiting, no input sanitization beyond zod on some forms.
- No observability: no error tracking (Sentry), no structured logs, no metrics/APM, no uptime probes.
- No environment configuration story (`.env` contract, secrets management).
- Accessibility is partial: color-safe charts and labels exist, but no systematic keyboard/focus audit, no skip links, dialogs unverified against screen readers (WCAG 2.2 AA is a workstream, not a sprinkle).
- Search is client-side substring matching; production needs DB-backed search (Postgres `pg_trgm` is enough initially).
- Timezone handling is implicit (UTC storage, local display) — fine, but must become an explicit convention once multiple regions use it.
- Single-tenant assumption baked in — fine for v1; note it before any SaaS ambition.

**What survives untouched:** the domain model (`lib/types.ts` becomes the
Prisma schema almost line-for-line), the RBAC *rules* (re-implemented
server-side), all UI components and page layouts, the scoring rules, the
quotation document, and the entire UX flow. The MVP's job was to prove
those; it did.

---

## Part 2 — Assessment of the 2026 research report

The report is right about the destination but front-loads several things
that belong years out. Honest triage:

### Adopt now (Phases 1–4)

| Report item | Verdict |
|---|---|
| Persistent DB migration, referential integrity, atomic lead→contact→account conversion | **Correct and urgent.** This is Phase 1. A *relational* DB over MongoDB — the domain is relational to its core (hierarchies, rollups, joins everywhere). Engine choice: **MySQL 8, not PostgreSQL** — see the decision record in `APP_DESIGN_PLAN.md` §4; it matches the existing madenkorea production stack and covers every requirement in this plan |
| API read latency ≤ 200ms | **Adopt** as p95 target for list/detail endpoints — achievable with indexes and pagination |
| Keep the India moat (GST quotations, INR lakh/crore, offline field capture) | **Agree strongly** — this is the differentiator; protect it through the rewrite |
| Privacy-first governance | **Adopt, but India-first:** the binding law for the target market is the **DPDP Act 2023** (consent, purpose limitation, data-principal rights, breach notification) — the report says GDPR but omits DPDP entirely. Build one rights/consent layer that satisfies DPDP and is GDPR-shaped for export markets |
| WCAG 2.2 AA accessibility | **Adopt** as a Phase 4 workstream with audit tooling in CI |
| SOC 2 audit trails | **Adopt the controls now** (server-side audit log, least-privilege, change management); pursue the actual SOC 2 report only when an enterprise deal demands it |

### Adjust

| Report item | Verdict |
|---|---|
| LCP ≤ 1.0s | Set **p75 LCP ≤ 2.0s** as the gate (Google's "good" is 2.5s); treat 1.0s as a stretch goal on the dashboard. Committing to 1.0s on data-heavy pages is how teams end up gaming metrics |
| 99.95% uptime SLA | That's ~22 min downtime/month with zero-downtime deploys and multi-AZ failover — premature to *commit* contractually. Target **99.9% measured** in v1 on managed infra (Vercel/RDS or equivalent), revisit after 2 quarters of real error budgets |
| Predictive AI scoring replacing rules | Right direction, wrong moment: models need **training data we don't have yet**. Ship the rule-based score in v1 *and log every outcome* (score at conversion time, win/loss, cycle length). That dataset is the prerequisite; revisit at ~1,000 closed deals |
| Omnichannel under one record | Correct end-state. Sequence it: logged email via provider (SES) → WhatsApp Business API webhooks → VoIP/SMS later. Each is its own integration project |

### Defer (post-v1; revisit with revenue/customer pull)

| Report item | Why defer |
|---|---|
| Agentic AI executing billing/support autonomously | There is no billing system, support module, or policy engine for agents to act *on*. Building guardrailed autonomy before the system of record exists inverts the dependency chain |
| SAP / Sage bi-directional sync | Enterprise ERP sync is a multi-quarter program per system; no current customer requires it. Start with **Stripe/Razorpay payment status** (the reference app already uses Razorpay — reuse that) as the first "order-to-cash" slice |
| No-code NLP schema customization | This is a platform-company feature (it's Salesforce-the-company's moat, built over a decade). A custom-fields JSON column gets 80% of the value at 2% of the cost |
| Voice interfaces / audio briefings | Nice demo, weak daily retention; revisit after field-usage telemetry exists |
| HIPAA | Not applicable unless healthcare customers are targeted; don't spend on it |

---

## Part 3 — Target architecture

```
                ┌─────────────────────────────────────────────┐
                │              Next.js 14 (App Router)        │
                │  Server Components (lists, detail, reports) │
                │  Client Components (kanban, dialogs, forms) │
                │  React Query for client cache + optimistic  │
                └───────────────┬─────────────────────────────┘
                                │ Route Handlers /api/* (zod-validated)
                                │ + NextAuth session, middleware guard
                ┌───────────────▼─────────────────────────────┐
                │           Service layer (TypeScript)        │
                │  RBAC enforcement · transactions · audit    │
                │  idempotency keys (offline sync) · events   │
                └──┬──────────┬──────────┬──────────┬─────────┘
                   │          │          │          │
             ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼──────────┐
             │Postgres │ │   S3    │ │  SES / │ │ WhatsApp Biz │
             │(Prisma) │ │presigned│ │ email  │ │ API (later)  │
             │         │ │ uploads │ │        │ │              │
             └─────────┘ └─────────┘ └────────┘ └──────────────┘

  Offline: service worker + IndexedDB outbox ──► POST with idempotency-key
  Notifications: DB rows → SSE endpoint → bell (poll fallback)
  Observability: Sentry + structured logs + uptime probe + Core Web Vitals
```

Key decisions (aligned with the madenkorea reference app so patterns carry
over): **Prisma + MySQL 8** (matches the reference stack's production ops;
recursive CTEs cover the hierarchy walk, InnoDB transactions cover atomic
conversion — full MySQL-vs-Postgres decision record in
`APP_DESIGN_PLAN.md` §4), **NextAuth** (credentials + sessions), **zod**
schemas shared between client forms and API validation, **AWS S3/SES** for
files and mail, **Razorpay** when payments enter scope. No tRPC/GraphQL —
plain route handlers keep the surface debuggable and match the reference
codebase.

The store refactor rule: every function in today's `StoreValue` interface
becomes one API endpoint with the same name and payload. `lib/types.ts` is
the Prisma schema draft. The UI keeps its components; only data access
changes.

---

## Part 4 — Phased delivery plan

### Phase 0 — Foundations (Week 1)
Git init + branch protection; CI (typecheck, lint, build, test); Vitest +
Playwright harnesses with first smoke tests; `.env` contract; Sentry;
remove `ignoreBuildErrors`-style escape hatches permanently.
**Exit:** every PR runs green checks; errors from a deployed preview reach Sentry.

### Phase 1 — Backend core (Weeks 2–5)
Prisma schema from `lib/types.ts` on MySQL 8 (money in paise, cuid ids,
indexes on `ownerId`, `stage`, `status`, `createdAt`); NextAuth with
credentials + seeded users; middleware route protection; service layer with
**server-side RBAC** (subtree visibility computed from a materialized
manager path, enforcing the `lib/policy.ts` capability matrix from
`APP_DESIGN_PLAN.md`);
route handlers for users/leads/contacts/accounts/deals/activities/
campaigns/notifications; **lead conversion as a single transaction**;
server-side audit log; seed script reproducing today's demo data.
**Exit:** two browsers logged in as different roles see correctly-scoped,
shared, persistent data; conversion is atomic under concurrent requests;
p95 read latency ≤ 200ms on seeded volume ×100.

### Phase 2 — Frontend migration (Weeks 6–8)
Replace `StoreProvider` with React Query hooks per resource; convert list
pages to Server Components with `searchParams`-driven pagination + filters
(server-side search); optimistic updates for kanban drag and activity
completion; `error.tsx` / `not-found.tsx` / loading and empty states
everywhere; scoring and rollups move to SQL.
**Exit:** MVP feature parity against the real backend; Lighthouse p75 LCP
≤ 2.0s on dashboard and leads with 10k-lead seed; no full-dataset transfer
to the client anywhere.

### Phase 3 — Production features (Weeks 9–11)
Real offline capture: PWA manifest + service worker + IndexedDB outbox +
idempotency-keyed sync with server dedupe and conflict policy
(last-write-wins + audit entry for v1); S3 presigned uploads replacing
data-URLs (10MB cap, image thumbnailing); SES for real email send + log;
notifications via SSE with poll fallback; CSV import as a server job with
row-level error report; quotation gains sequential numbering server-side.
**Exit:** airplane-mode capture on a phone syncs correctly with no
duplicates when connectivity returns; attachments survive across devices;
an emailed quotation arrives in a real inbox.

### Phase 4 — Hardening, compliance, accessibility (Weeks 12–14)
Security: headers (CSP, HSTS), rate limiting, dependency audit, secrets
review, basic pen-test checklist. **DPDP/GDPR-ready layer:** consent
capture on lead forms, per-record data export, right-to-erasure flow
(anonymize, preserve aggregates), retention policy config. Accessibility:
keyboard/focus audit of every dialog and the kanban (keyboard move-to-stage
already exists — verify), axe in CI, screen-reader pass on core flows.
Load test at 50 concurrent users / 100k leads. Ops runbook: backups (PITR),
restore drill, deploy/rollback procedure, uptime monitoring with 99.9%
target measured.
**Exit:** the go-live checklist below is fully green.

### Phase 5 — Post-launch roadmap (quarterly, pull-driven)
1. **Outcome logging for ML scoring** (start day 1 of Phase 1 — it's just
   columns) → predictive scoring at ~1,000 closed deals.
2. **Payments**: Razorpay/Stripe payment-link status on deals — first
   order-to-cash slice.
3. **WhatsApp Business API**: inbound webhooks → messages under the
   contact record (replaces deep links).
4. **Custom fields**: JSON-column custom attributes per entity + admin UI —
   the pragmatic 80% of "no-code customization".
5. Voice capture, ERP sync, agentic workflows: revisit against real
   customer demand and the telemetry gathered above.

---

## Part 5 — Go-live checklist (v1 definition of done)

- [ ] All data server-persisted; localStorage holds only UI preferences
- [ ] Real login; server-side RBAC proven by cross-role integration tests
- [ ] Lead conversion transactional (concurrency test passes)
- [ ] p95 API reads ≤ 200ms; p75 LCP ≤ 2.0s at 10k-lead scale
- [ ] Offline outbox syncs idempotently from a real device
- [ ] Files in S3; email via SES; notifications via SSE
- [ ] Error boundaries + Sentry + structured logs + uptime probe live
- [ ] Backups with tested restore; deploy + rollback runbook
- [ ] DPDP consent + export + erasure flows working
- [ ] axe CI clean; keyboard-only walkthrough of capture→convert→secure
- [ ] CI green: typecheck, lint, unit, integration, e2e smoke
- [ ] Load test signed off; security headers verified

---

## Part 6 — Effort summary

| Phase | Scope | Duration (1–2 eng) |
|---|---|---|
| 0 | Repo, CI, testing, observability foundations | 1 week |
| 1 | Database, auth, API, server RBAC, transactions | 4 weeks |
| 2 | Frontend on real data, pagination, states | 3 weeks |
| 3 | Offline, files, email, notifications, import | 3 weeks |
| 4 | Security, DPDP, accessibility, load, ops | 2–3 weeks |
| **Total to production v1** | | **~12–14 weeks** |

The single most important sequencing rule: **nothing from Phase 5 starts
until Phase 4 is done.** The research report's destination (system of
action, predictive intelligence, omnichannel) is only reachable from a
boringly solid system of record — which is what these 14 weeks build.

---

## Part 7 — Addendum: 2026 market-assessment report (report #2)

The second research report is a **buyer's-side market assessment** —
vendor shares, TCO comparisons, and "which CRM should an enterprise
purchase." We are the *builder*, not the buyer, so most of its tables
don't apply directly. Three sections of it are genuinely valuable to us;
the rest is context. One caution before using it externally: several
figures are unverifiable or forward-dated (IDC "April 2026" data, Gartner
2029 projections, vendor credit prices) — treat them as directional,
never cite them to a client as fact.

### 7.1 What the report validates about our choices

| Report finding | Our position |
|---|---|
| "Consolidation pressure": 1,367 point solutions died in a year; buyers want unified single-schema stacks; Salesforce's multi-stack (acquisition-glued, MuleSoft middleware) is framed as its weakness | **Validates our architecture.** We are HubSpot-shaped by construction: one schema, one database, every module native. This is now a codified tenet — see 7.3 T1 |
| Zoho Zia needs 60–90 days of clean historical data before AI is reliable ("time-to-value barrier") | **Validates Phase 5 sequencing** — outcome logging from Phase 1, models only after data exists. Also sets rollout expectations: when we ship AI scoring, communicate a data-maturation window instead of promising day-1 magic |
| Implementation failure patterns: black-box AI, legacy data debt, AI literacy gap, disconnected workflows | Maps 1:1 onto guardrails we now codify (7.3 T5–T7). "Disconnected workflows" we avoid by the unified-schema tenet |
| "Clicks-before-code": native configuration over custom code | Validates the admin-console strategy (targets, products, org settings, pipeline settings as *data*, plus JSON custom fields later) |

### 7.2 Where we actually sit in their market map

The report compares giants; our realistic competitive frame is different
and worth stating plainly: **we compete with Zoho (and vertical Indian
field-sales tools), not Salesforce.** Zoho's benchmark numbers therefore
become our targets — this was a gap: our plans had engineering KPIs but no
competitive product benchmarks.

| Benchmark (from report) | Zoho (their best-in-class) | Our target |
|---|---|---|
| Deployment timeline | 1–2 weeks | **≤ 1 week** to a working org (seeded roles, imported leads) |
| Admin overhead | 0.25–0.5 FTE | **≤ 0.25 FTE** — the admin console must make this true |
| License floor | ~$480/user/yr (~₹3.3k/user/mo eq.) | Price *under* Zoho for the India field-sales segment; packaging decision (seats vs outcome hybrid) is a business workstream due **before GTM**, informed by 7.3 T6 |
| Differentiators vs Zoho | — | Offline-first field capture, GST/INR-native quoting, WhatsApp-centric comms, hierarchy model matching Indian sales orgs |

### 7.3 Gap fills — new tenets and roadmap items

**T1 — Unified-schema tenet (architecture, permanent).** All future
modules (support/ticketing, marketing, payments) extend the *same*
database and data model. No per-module stores, no internal sync layers.
The report's Salesforce-vs-HubSpot contrast is the cautionary tale.

**T2 — Data-quality tooling is a product feature, not hygiene**
(Phase 2–3; admin spec updated in `APP_DESIGN_PLAN.md`). We *detect*
duplicates but cannot resolve them — added: **duplicate merge tool**
(field-level survivor picking, relations re-pointed, audit-logged),
admin-configurable validation rules, and a data-quality panel (dupe
count, completeness). Rationale: "legacy data debt — AI amplifies
existing data errors."

**T3 — In-app onboarding & help** (Phase A/2). The report's "AI literacy
gap" generalizes: features nobody understands don't get adopted. Added: a
first-run checklist per role (rep: capture → convert → secure a demo
lead), empty states that teach, and a help panel. Doubles as the
self-serve onboarding that makes the ≤1-week deployment target real.

**T4 — Published platform limits** (Phase 4). The Salesforce governor-
limits table is a lesson in *transparency*: we define and document our own
ceilings (API rate limits per token, import row caps, attachment size,
webhook retry policy) rather than letting users discover them as errors.

**T5 — AI guardrails, codified now, enforced when agents ship**
(Phase 5 gate). Any autonomous action requires: a visible decision log on
the record timeline, human-approval steps for high-risk actions (pricing,
sends, deletes), scoped credentials per agent (least privilege — reuse
the `lib/policy.ts` capability matrix), and sandbox-first rollout.

**T6 — AI unit economics before AI features** (Phase 5 gate). The
report's Flex-Credit break-even analysis is its best content: the same
task can cost $0.10 or $2.00 depending on billing model — a 20× variance.
Before shipping any LLM-backed feature we model cost-per-action vs
expected actions-per-user-day, and prefer **outcome-denominated** value
metrics (per lead qualified, per conversation resolved) over raw token
spend — that's where the market is moving (HubSpot $0.50/resolution,
Intercom, Zendesk).

**T7 — Voice capture, re-scoped from "defer" to cheap-first**
(Phase 3 candidate / Phase 5 full). The report's 3× data-entry-speed
claim aligns with our field-rep persona. The cheap version needs no LLM:
**Web Speech API dictation** into activity/lead notes (a mic button on
textareas) — hands-free-ish capture between site visits. Full
conversational agents ("audio briefings") stay in Phase 5.

**T8 — Orchestration framework candidates noted, not adopted**
(Phase 5). When agentic work starts: LangGraph (stateful graphs),
CrewAI (role-based teams), AutoGen (Microsoft ecosystem). Decision
deferred until there is a concrete first workflow to automate.

**Explicitly not adopted:** Spatial/AR CRM (the 61% stat is consumer
retail; irrelevant to B2B field sales), vendor market-share tables
(context only), and Microsoft price-hike planning (buyer concern, not
ours).
