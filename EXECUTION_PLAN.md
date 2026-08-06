# Execution Plan — SalesForce: MVP → Production v1 → Growth

**This is the single source of truth for delivery.** It consolidates and
supersedes the phase lists in `PRODUCTION_ROADMAP.md` (infrastructure
phases 0–5), `APP_DESIGN_PLAN.md` (design phases A–C), and the triage of
both research reports (Part 2 and Part 7 of the roadmap). Those documents
remain the reference for *rationale*; this one is the *sequence*.

**Assumptions:** 1–2 engineers; existing MySQL/AWS operational experience
from the madenkorea stack; the current MVP continues to serve as the
client demo throughout.

---

## 0. The one-paragraph strategy

Finish the *design* of the product while change is cheap (Milestone 1, in
the mock-store MVP — this also upgrades the client demo), then rebuild the
foundations beneath an unchanged UX (Milestones 2–3), then make it
field-real and enterprise-safe (Milestones 4–5). Position against **Zoho,
not Salesforce**: win on offline-first field capture, GST/INR-native
quoting, WhatsApp-centric communication, Indian org-hierarchy modelling,
≤1-week deployment, ≤0.25 FTE admin burden. AI features wait behind two
gates: accumulated outcome data and a unit-economics model.

---

## 1. Milestone plan

### M0 — Foundations (Week 1, runs parallel to M1)

| # | Item | Notes |
|---|---|---|
| 0.1 | `git init`, first commit of current MVP, branch protection | The codebase is not under version control today — nothing else starts before this |
| 0.2 | CI pipeline: typecheck, lint, build on every PR | GitHub Actions |
| 0.3 | Test harness: Vitest (unit) + Playwright (e2e) with first smoke tests (login → capture lead → convert) | Tests written against the MVP now keep working after the backend swap — they encode the spec |
| 0.4 | Sentry + `.env` contract | Error visibility from the first deploy |

**Exit:** every PR runs green checks; a deployed preview reports errors.

### M1 — Design completion in the MVP (Weeks 1–3) — *demo-visible*

All against the mock store; ships the design decisions the backend will
then implement. The client demo gets an admin console and role-shaped UX.

| # | Item | Source |
|---|---|---|
| 1.1 | `lib/policy.ts` role × capability matrix + `<RequireCapability>` guard + `/403` page | Design §2.2 |
| 1.2 | Public landing page at `/`; login restyled as credentials-with-demo-picker | Design §2.1 |
| 1.3 | Role-based post-login redirects (rep → My Day; managers/admin → dashboard) + grouped, role-aware navigation | Design §2.1/2.3 |
| 1.4 | **Admin console v1** (`/admin`): Users (edit/deactivate + handover wizard), Targets editor, Products CRUD, Organisation settings (name/GSTIN/terms → feeds quotation template), Pipeline settings (labels + forecast weights as data) | Design §2.4 |
| 1.5 | Contact detail page (`/contacts/[id]`) with timeline; search + notifications deep-link to records | Design §2.5 |
| 1.6 | Edit + archive for contacts/accounts/deals; single + bulk lead reassignment; destructive-confirm pattern | Design §1.5 |
| 1.7 | `error.tsx`, `not-found.tsx`; role-variant dashboard composition | Design §2.5 |
| 1.8 | First-run onboarding checklist per role + teaching empty states | Report #2 gap T3 |
| 1.9 | Quote history on deals (number, date, amount, status draft/sent) | Design §2.5 |

**Exit:** demo walkthrough covers landing → login → role-landing → admin
tasks (set a target, add a product, deactivate a rep with handover) with
no dead ends; policy matrix is the only permission source in the UI.

### M2 — Backend core (Weeks 4–7)

| # | Item | Notes |
|---|---|---|
| 2.1 | Prisma schema on **MySQL 8** from `lib/types.ts` + M1 additions (org settings, quotes, policy-relevant fields). Money in paise; cuid ids; indexes on `ownerId`, `stage`, `status`, `createdAt`; **outcome-logging columns from day one** (score at conversion, cycle timestamps, win/loss) | DB decision record: Design §4 |
| 2.2 | NextAuth credentials + sessions; middleware route protection; invite-token and password-reset schema (flows land in M3) | |
| 2.3 | Service layer: **server-side RBAC** (materialized manager-path for subtree visibility) enforcing the same `lib/policy.ts` matrix; zod-validated route handlers mirroring every store action 1:1 | The MVP store interface *is* the API spec |
| 2.4 | **Transactional lead conversion** (lead + contact + account + deal in one transaction); concurrency test | |
| 2.5 | Server-authored audit log; admin audit viewer wired to it | |
| 2.6 | Seed script reproducing demo data; staging environment | |

**Exit:** two browsers, different roles, correctly-scoped shared
persistent data; conversion atomic under concurrent requests; p95 reads
≤ 200ms at seed ×100.

### M3 — Frontend on real data (Weeks 8–10)

| # | Item | Notes |
|---|---|---|
| 3.1 | Replace `StoreProvider` with React Query hooks per resource; delete localStorage persistence (UI prefs only) | |
| 3.2 | List pages → Server Components with `searchParams` pagination/filters; DB-backed search | |
| 3.3 | Optimistic updates: kanban drag, activity complete, notification read | |
| 3.4 | Skeleton loading + failure/retry states everywhere | |
| 3.5 | Scoring, rollups, forecast, leaderboards move to SQL | |
| 3.6 | Invite → set password → first login; forgot/reset password; session expiry UX | Kills the persona picker outside demo mode |

**Exit:** feature parity with the M1 app against the real backend; p75
LCP ≤ 2.0s on dashboard + leads at 10k-lead seed; no full-collection
transfer to the client anywhere.

### M4 — Field-real features (Weeks 11–13)

| # | Item | Notes |
|---|---|---|
| 4.1 | Real offline capture: PWA manifest + service worker + IndexedDB outbox + idempotency-keyed sync, server dedupe, last-write-wins + audit on conflict | The flagship differentiator — test on real devices |
| 4.2 | Attachments → S3 presigned uploads (10MB cap, thumbnails); data-URLs removed | |
| 4.3 | Email via SES: send + log; **quotation emailed as PDF with sent/accepted status** | |
| 4.4 | Notifications via SSE (poll fallback) | |
| 4.5 | CSV import as server job with row-level error report | |
| 4.6 | **Duplicate merge tool** + validation-rule admin + data-quality panel | Report #2 gap T2 — ships *before* any AI |
| 4.7 | Voice dictation (Web Speech API mic on notes fields) | Report #2 gap T7 — the cheap 80% of voice |
| 4.8 | Approvals v1: discount-threshold request → manager approve/reject, blocks quote until approved | Design §2.5 |

**Exit:** airplane-mode capture on a phone syncs with zero duplicates; an
emailed quotation reaches a real inbox; a dupe pair merges cleanly with
relations re-pointed.

### M5 — Hardening & launch (Weeks 14–16)

| # | Item | Notes |
|---|---|---|
| 5.1 | Security: headers (CSP/HSTS), rate limiting, dependency + secrets audit, pen-test checklist | |
| 5.2 | **Published platform limits** (rate limits, import caps, file sizes, webhook retries) in docs | Report #2 gap T4 |
| 5.3 | **DPDP-first privacy layer**: consent capture on lead forms, per-record export, right-to-erasure (anonymize, keep aggregates), retention config; GDPR-shaped for export markets | Roadmap Part 2 |
| 5.4 | Accessibility: axe in CI, keyboard/focus audit of dialogs + kanban, screen-reader pass on capture→convert→secure | WCAG 2.2 AA workstream |
| 5.5 | Load test (50 concurrent / 100k leads); backups with restore drill; deploy/rollback runbook; uptime monitoring (99.9% measured target) | |
| 5.6 | Go-live checklist (Roadmap Part 5) fully green | |

**Launch: end of Week 16** (16 weeks total — the earlier 12–14-week
estimate + the ~2-week M1 design build now explicitly in scope).

---

## 2. Post-launch growth track (quarterly, pull-driven)

Ordered by dependency and customer value; each item gated, not scheduled:

| # | Item | Gate |
|---|---|---|
| G1 | Payments: Razorpay payment-link status on deals (first order-to-cash slice) | First paying customer needing it |
| G2 | WhatsApp Business API: inbound webhooks → messages under the contact record (replaces deep links) | API access approved |
| G3 | Custom fields: JSON-column attributes per entity + admin UI | ≥2 customers with schema requests |
| G4 | Predictive lead scoring | **~1,000 logged closed-deal outcomes** (logging starts M2.1) + unit-economics model (tenet T6) |
| G5 | Agentic workflows (first: auto-draft follow-ups for approval) | T5 guardrails implemented (decision logs, human approval, scoped credentials); orchestration framework chosen then (LangGraph/CrewAI/AutoGen) |
| G6 | Support/ticketing module, deeper ERP sync, multi-tenancy | Revenue-driven; unified-schema tenet T1 applies; multi-tenancy triggers the Postgres/RLS re-evaluation (Design §4) |

**Not on the roadmap by decision:** Spatial/AR CRM, HIPAA, NLP no-code
schema builder, SAP/Sage sync (revisit only on enterprise customer pull).

---

## 3. Business workstream (parallel, non-engineering)

| When | Item |
|---|---|
| During M1–M2 | Positioning one-pager vs Zoho (differentiators: offline field capture, GST/INR quoting, WhatsApp, hierarchy model) |
| During M3–M4 | **Pricing & packaging decision** — per-seat under Zoho's floor, evaluate outcome-based components (report #2 trend); must close before GTM |
| During M5 | Pilot customers identified for launch; onboarding materials from M1.8 checklist |

---

## 4. Consolidated targets & KPIs

| KPI | Target | Verified at |
|---|---|---|
| API read latency | p95 ≤ 200ms | M2, re-checked M5 load test |
| LCP (dashboard, leads @10k) | p75 ≤ 2.0s (1.0s stretch) | M3, M5 |
| Uptime | 99.9% measured (SLA commitment deferred 2 quarters) | Post-launch |
| Deployment time (new org) | ≤ 1 week self-serve | M5 pilot |
| Admin overhead | ≤ 0.25 FTE | Pilot feedback |
| Offline sync integrity | Zero duplicate/lost leads in device tests | M4 |
| Accessibility | axe clean in CI; keyboard-only core flows | M5 |
| Test coverage | Smoke e2e on all core flows; unit on policy/RBAC/scoring/money | M0 onward, gate in CI |

---

## 5. Top risks & mitigations

| Risk | Mitigation |
|---|---|
| Solo/small team hits a 16-week wall | M1 ships standalone demo value; M2–M3 is the only hard-dependency chain; M4 items are individually deferrable except offline (4.1) |
| Offline sync complexity underestimated | It's the differentiator — prototype the outbox in week 11 spike before committing the design; last-write-wins keeps v1 simple |
| Scope creep from demo feedback | New feature asks go to the growth track by default; only M1-list items touch the MVP |
| RBAC perf at depth/scale | Materialized path decided upfront (M2.3); load-tested at M5 |
| Storage-version habit carries into prod | M2 onward: schema changes only via Prisma migrations — key-bump resets end at M3.1 |

---

## 6. Immediate next actions (this week)

1. `git init` + initial commit + push to a private remote (M0.1).
2. CI + test harness skeleton (M0.2–0.3).
3. Start M1.1: `lib/policy.ts` capability matrix — every later guard,
   nav group, and server check reads from this file.
4. Business: draft the Zoho-comparison one-pager while M1 is built.
