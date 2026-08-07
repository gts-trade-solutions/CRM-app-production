# SalesForce CRM

A field-first CRM for Indian sales teams — online/offline lead capture,
hierarchy-scoped access, a Cold→Warm→Hot→Order-Secured pipeline, GST-ready
quotations, activities, campaigns, targets and reporting.

**Stack:** Next.js 14 (App Router) · TypeScript 5.6 · Prisma 6 + MySQL 8 ·
NextAuth (credentials, JWT sessions) · TanStack React Query 5 · Tailwind 3 +
shadcn/ui · Recharts · dnd-kit · vitest.

## Getting started

Prerequisites: Node 20+, MySQL 8 running locally.

```bash
npm install
cp .env.example .env         # fill DATABASE_URL, NEXTAUTH_URL/SECRET
npm run db:push              # create/update the schema
npm run db:seed              # load the demo dataset
npm run dev                  # http://localhost:3000
```

**Demo sign-in:** every seeded member uses password `demo123`
(e.g. `sneha@salesforce.demo` — sales rep, `rahul@salesforce.demo` — team
lead, `arjun@salesforce.demo` — admin). The login page also offers a
one-click persona grid.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run build:isolated` | Build into `.next-build` — safe while `dev` is running |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm test` | Unit tests (no database needed) |
| `npm run test:integration` | Integration tests against `DATABASE_URL` |
| `npm run db:push` / `db:seed` | Prisma schema push / demo seed |

`dev` and `build` both own `.next`, and a build clears that directory before
it writes. Running them together therefore knocks the dev server's chunks out
from under it — the symptom is a dev server that dies or starts throwing
module-not-found errors, plus `EPERM`/`ENOENT` failures in the build. Use
`build:isolated` (it sets `NEXT_DIST_DIR=.next-build`, honoured by
`next.config.js`) whenever you want to verify a build without stopping dev.
Deploys leave `NEXT_DIST_DIR` unset and use the plain `build` + `start` pair.

CI (GitHub Actions) runs typecheck, lint, both test suites (against a
MySQL 8 service container) and the production build on every push/PR.

## Architecture in one paragraph

Route handlers under `app/api/**` are the whole backend: each one resolves
the session actor (`requireUser`), computes the actor's hierarchy-visibility
set server-side (`lib/server/rbac.ts`), validates input with zod, and reads/
writes MySQL through Prisma (money stored as paise `BigInt`, converted to
rupees at the wire). Multi-record flows — lead conversion, deactivation
handover, quote numbering, duplicate merges, PII erasure — run inside
transactions. The UI consumes it all through typed React Query hooks
(`lib/api/*`); role capabilities come from one matrix (`lib/policy.ts`)
enforced in the UI *and* on the server.

## Feature map

- **Leads** — capture (online/offline sources, attachments, campaign
  attribution, DPDP consent, fairest-rep auto-assign), scoring
  (Hot/Warm/Cold), CSV import with server-side dedupe, bulk reassign,
  conversion (atomic contact + account + deal).
- **Offline** — leads captured offline queue in a durable outbox and replay
  with idempotency keys the server dedupes; PWA service worker keeps
  visited pages available (production builds).
- **Pipeline** — optimistic drag-and-drop kanban; deal workspace with
  product line items driving value, editable close date, numbered GST
  quotations (draft/sent/accepted) printed from org settings.
- **Activities** — My Day (overdue/today/upcoming), manager delegation with
  notifications, geo check-in, voice dictation (Web Speech, en-IN),
  logged emails.
- **Hierarchy** — Sales Head → RM → Team Lead → Rep; every query is scoped
  to the actor's subtree; Team page shows stats + target attainment;
  deactivation hands over open records and reports in one transaction.
- **Admin** — users/roles, monthly targets, product catalogue, organisation
  identity (feeds quotations), pipeline vocabulary + forecast weights,
  duplicate-merge Data Quality tab.
- **Insight** — role-scoped dashboard, stage-weighted forecast, period
  reports, campaign ROI, CSV exports, server-authored audit trail.
- **Live** — SSE notification stream; global Ctrl+K search.
- **Privacy (DPDP)** — consent timestamps, per-record JSON export,
  admin-only audited PII erasure preserving business aggregates.

## Published API limits

| Scope | Limit |
|---|---|
| Credential sign-in | 10 requests / minute / IP |
| API writes | 60 requests / minute / IP |
| API reads | 300 requests / minute / IP |
| CSV import | 2,000 rows / request |
| Attachments | 10 files / upload, small images inlined (S3 pending) |

## Documentation

- `DOCUMENTATION.md` — full application reference
- `EXECUTION_PLAN.md` — delivery plan + live status
- `PRODUCTION_ROADMAP.md` / `APP_DESIGN_PLAN.md` — rationale and research
  triage behind the plan

## Known boundaries

- Attachment binaries and outbound email use interim implementations
  (inline previews, logged-only email) until AWS S3/SES credentials are
  configured (`.env.example` lists the variables).
- New members are created with the demo password; the invite/reset flow is
  the next auth increment.
- Rate limiting is in-memory (single node); move to Redis when scaling out.
