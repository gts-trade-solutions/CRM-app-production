# Application Design & Flow Plan

Companion to `PRODUCTION_ROADMAP.md`. That document covers infrastructure;
this one covers what the user actually experiences: entry and authentication
flow, authorization as a *design* (not just a data filter), role-specific
experiences, the missing administration surface, and incomplete lifecycle
flows. Each gap is followed by the target design and a phased delivery plan
— including what can be fixed **now in the frontend MVP** versus what lands
with the production backend.

---

## 1. Design-gap audit

### 1.1 Entry & authentication flow — there isn't one

Today: `/` silently redirects to a persona-picker. That is a demo device,
not an auth flow. Missing:

- **No public entry point** — no landing/home page that frames the product
  before login; the app assumes you already know what it is.
- **No credential flow** — no username/password, no error states for bad
  credentials, no forgot/reset-password path, no "invite → set password →
  first login" onboarding for members added on the Team page (they're
  created but can never actually log in — a dead-end flow).
- **No session concept** — no expiry, no re-auth, no "signed out
  everywhere" behaviour. "Logout" is labelled *Switch user*, which is a
  demo affordance, not a real action.
- **No unauthorized experience** — there is no 401/403 page; a user who
  deep-links somewhere they shouldn't be gets component-level fallbacks at
  best.

### 1.2 Authorization is a data filter, not a designed policy

The RBAC layer answers exactly one question — *whose records can I see?* —
and answers it well. But authorization in a real app is a **policy across
routes, actions, and fields**, and that layer doesn't exist:

- **Every role sees every page.** A sales rep gets Reports, Campaigns and
  Team in their nav — pages designed for managers. Nothing is
  route-restricted; the app relies on content happening to be scoped.
- **Action permissions are ad-hoc** — scattered `canManageWorkforce()`
  checks inside components rather than a single declared policy
  (role × action matrix) that both UI and (later) API read from.
- **No field-level rules** — e.g. should a rep edit their own monthly
  target, or a deal's value after Hot stage? Undefined, because there is no
  policy artifact to define it in.

### 1.3 One-size-fits-all role experience

Everyone lands on the same `/dashboard` with the same layout. But the
personas have different jobs-to-be-done on login:

| Persona | First question of the day | Current landing | Right landing |
|---|---|---|---|
| Sales rep | "Who do I call now?" | Generic dashboard | **My Day** (their working list) |
| Team lead / RM | "How is my team tracking?" | Same dashboard | Dashboard, team-first layout |
| Sales head | "How is the org tracking + is the system healthy?" | Same dashboard | Dashboard + admin entry |

### 1.4 The missing administration surface (biggest structural gap)

There is **no admin area at all**. Consequences visible today:

- **Targets are hard-coded** in seed data — no UI exists to set or revise
  anyone's quota, which makes the entire attainment feature unmanageable.
- **Product catalogue is fixed** — quotations depend on products nobody
  can add, reprice, or retire.
- **Organisation identity is hard-coded** — the quotation prints a
  fictional company name, address and GSTIN from a string literal.
- **User lifecycle is half-built** — members can be *added* (Team page)
  but never edited, deactivated, or transferred; there is no answer to
  "a rep resigned — what happens to their 40 open leads?"
- **No audit view** — activity feed exists but there's no admin-grade,
  filterable audit trail view.

### 1.5 Incomplete CRUD & lifecycle flows

Records can be created everywhere but rarely edited and never removed:

| Entity | Create | Edit | Delete/Archive | Reassign owner |
|---|---|---|---|---|
| Lead | ✅ | ✅ | ❌ | ❌ (only at capture) |
| Contact | ✅ | ❌ | ❌ | ❌ |
| Account | ✅ | ❌ | ❌ | ❌ |
| Deal | ✅ | partial (stage, items, date) | ❌ | ❌ |
| Campaign | ✅ | partial (budget/spend/status) | ❌ | — |
| User | ✅ | ❌ | ❌ | — |
| Product | ❌ seed-only | ❌ | ❌ | — |
| Target | ❌ seed-only | ❌ | — | — |

Also missing: bulk actions (multi-select reassign/disqualify), archive
semantics (old lost deals pollute lists forever), and any approval flow
(the "discount approval" in the demo is just a task — there's no
request → approve/reject mechanic).

### 1.6 Navigation & information architecture

- **Flat nav for all roles** — nine top-level items with no grouping and
  no role awareness; will not scale past an admin section.
- **Contacts have no detail page** — the only entity without one. Global
  search for a contact dumps you on the list; notifications and account
  pages can't deep-link to a person; the contact timeline
  (`relatedType: 'contact'` activities exist!) has no home.
- **Notifications aren't actionable** — "Rahul assigned you: call X" is
  plain text; every notification should navigate to its record.
- **Quotation is a dead end** — generated, printable, but not stored; no
  quote history on the deal, no status (sent/accepted).

### 1.7 UX state coverage

No `error.tsx`, `not-found.tsx`, or 403 page; no skeleton loading states
(instant local reads hide this — production fetches won't); inconsistent
empty states; no confirmation pattern for destructive actions (nothing is
deletable yet, but the pattern must exist before delete does).

---

## 2. Target design

### 2.1 Entry flow & route map

```
Public
  /                → Landing: product framing + "Sign in" (marketing-lite)
  /login           → Credentials form (MVP: persona picker behind a
                     "demo mode" toggle; Production: email + password)
  /forgot-password → (production) reset flow
  /invite/[token]  → (production) accept invite → set password

Authenticated  (post-login redirect by role)
  sales_rep                → /activities  (My Day)
  team_lead / reg. manager → /dashboard   (team-first)
  admin                    → /dashboard   (org view, admin in nav)

Guarded
  /admin/**        → admin only          → 403 page otherwise
  /team            → team_lead and above → 403 for reps
  /campaigns (manage), /reports (export) → action-gated, page open
```

### 2.2 Authorization policy — one artifact, declared once

A single `lib/policy.ts` — a role × capability matrix that the UI reads for
rendering and the future API reads for enforcement (same file, imported
server-side in production):

| Capability | Rep | Team Lead | Reg. Manager | Admin |
|---|---|---|---|---|
| View /admin | — | — | — | ✅ |
| View /team | — | ✅ | ✅ | ✅ |
| Manage users (add/edit/deactivate) | — | below own level | below own level | ✅ |
| Set targets | — | own team | own region | ✅ |
| Manage products / org settings | — | — | — | ✅ |
| Create/edit campaigns | — | ✅ | ✅ | ✅ |
| Reassign records | — | within team | within region | ✅ |
| Delete/archive records | — | within team | within region | ✅ |
| Assign activities | — | ✅ | ✅ | ✅ |
| Export CSV | ✅ (own scope) | ✅ | ✅ | ✅ |

Route guards become one component (`<RequireCapability>`) + a `/403` page;
scattered `canManageWorkforce()` calls migrate into the matrix.

### 2.3 Role-aware navigation

Nav renders from the policy matrix, grouped:

- **Work** — Dashboard, My Day, Leads, Contacts, Accounts, Pipeline
- **Insights** — Reports, Campaigns
- **Management** — Team *(TL and above)*
- **Administration** — Admin *(admin only)*

Rep nav therefore shows 8 items and no dead pages; admin shows all.
Dashboard becomes role-composed: rep variant leads with My Day + own
funnel; manager variant leads with team attainment + team activity; admin
variant adds org totals and admin shortcuts.

### 2.4 Admin console — `/admin`

| Section | Contents |
|---|---|
| **Overview** | Org KPIs, seats, storage/health placeholders |
| **Users & roles** | Full user table (all levels), invite/add, edit role/manager/region, **deactivate with handover wizard** — pick a successor, all open leads/deals/activities reassign in one action (audit-logged) |
| **Targets** | Editable monthly quota per member with roll-up preview; history per quarter (production) |
| **Products** | Catalogue CRUD: name, SKU, category, price, active flag (inactive products stay on old quotes, unavailable on new) |
| **Organisation** | Company name, address, GSTIN, logo, quote terms & validity, GST rate — **feeds the quotation template** (removes today's hard-coded block) |
| **Pipeline settings** | Stage labels + forecast probabilities (today's Cold/Warm/Hot weights become data) |
| **Data quality** | Duplicate detection queue with a **merge tool** (field-level survivor picking, deals/activities re-pointed, audit-logged), admin-configurable validation rules (required fields, formats), completeness dashboard. Rationale: report #2's "legacy data debt" — AI features amplify dirty data, so cleanup tooling ships *before* AI does |
| **Audit log** | Filterable event trail (server-authored in production) |

### 2.5 Completed lifecycle flows

- **Contact detail page** (`/contacts/[id]`) — profile, account link, its
  deals, activity timeline, WhatsApp/email actions. Search + notifications
  deep-link here.
- **Edit + archive on every entity**, with a shared confirm dialog and
  audit entries; archived records excluded from lists/metrics by default.
- **Reassignment** — single-record ("transfer to…") and bulk (multi-select
  leads → reassign), permission-gated by the matrix.
- **Notification click-through** — every notification carries a target
  route.
- **Quote history** — generated quotes stored on the deal (number, date,
  amount, status: draft/sent/accepted) — makes the quotation a record, not
  a printout.
- **Approvals (production)** — request/approve mechanic (first use:
  discount above a threshold routes to the manager, blocks quote until
  approved).
- **Standard states** — `error.tsx`, `not-found.tsx`, `/403`, skeleton
  loaders, empty states with a primary action, destructive-confirm
  pattern.

---

## 3. Delivery plan

### Phase A — in the current frontend MVP (~1–1.5 weeks, demo-visible)

Everything here works against the existing mock store and makes the demo
*more* convincing (the client sees an admin console and role-shaped UX):

1. `lib/policy.ts` capability matrix + `<RequireCapability>` + `/403`.
2. Role-based post-login redirects; role-aware grouped navigation.
3. Public landing page at `/` (product framing + sign-in), login styled as
   credentials-with-demo-picker.
4. **Admin console v1**: Users (edit, deactivate + handover wizard),
   Targets editor, Products CRUD, Organisation settings wired into the
   quotation template.
5. Contact detail page; notification click-through.
6. Edit/archive for contacts, accounts, deals; single + bulk lead
   reassignment.
7. `error.tsx` / `not-found.tsx`; destructive-confirm pattern; role-variant
   dashboard (rep vs manager composition).
8. **First-run onboarding**: per-role checklist (rep: capture → convert →
   secure a demo lead; admin: set targets → add a product → invite a
   member), teaching empty states, and a lightweight help panel — this is
   what makes a ≤1-week self-serve deployment credible (report #2
   benchmark vs Zoho).

### Phase B — with production backend (maps to Roadmap Phases 1–2)

Real credential auth (NextAuth) + sessions + middleware route protection;
invite/reset-password flows replacing the persona picker; the **same**
policy matrix enforced in the service layer (route guards become UX, not
security); server-authored audit log behind the admin viewer.

### Phase C — with production hardening (maps to Roadmap Phases 3–4)

Approval flows; quote lifecycle (sent/accepted + emailed via SES); audit
log filters/export; org-settings-driven numbering sequences; archived-data
retention policies (feeds the DPDP work); **duplicate merge tool +
validation-rule admin** (Data quality section above); **voice dictation**
on notes fields via the Web Speech API (mic button — the cheap 80% of
"voice CRM" for field reps; full conversational agents remain Roadmap
Phase 5).

**Sequencing note:** Phase A is worth doing *before* backend work even
though some of it gets re-plumbed — it forces the policy matrix, admin
information architecture, and flow decisions to be settled while change is
cheap, and the backend then implements a settled design instead of
guessing.

---

## 4. Database engine — MySQL vs PostgreSQL (decision record)

**Question:** is migrating to PostgreSQL absolutely necessary?
**Answer: No.** The genuinely necessary move is *browser localStorage → a
real relational database with transactions*. Which engine is a preference,
and the case for **MySQL 8** is actually stronger for this team:

| Consideration | Assessment |
|---|---|
| Team & ops reality | The reference app (madenkorea) runs **Prisma + MySQL** in production — existing operational knowledge, backup/restore practice, hosting. Reusing it removes a whole learning curve of risk |
| Everything this schema needs | MySQL 8 has it: **recursive CTEs** (the manager-hierarchy walk), window functions (leaderboards), JSON columns (custom fields later), FULLTEXT search (leads/contacts), proper transactions with row locking (atomic lead conversion) via InnoDB |
| Prisma abstraction | The schema and every query in the plan are written through Prisma — the `provider` line is the main difference. Migrating later is feasible while the data is small |
| What Postgres would add | `pg_trgm` fuzzy search, partial indexes, JSONB GIN indexing, row-level security, transactional DDL (safer migrations). All *nice*; **none required** by anything in this roadmap's v1–v2 |
| When to revisit | If row-level security becomes the chosen mechanism for tenant isolation (SaaS multi-tenancy), or search outgrows FULLTEXT — those are the genuine Postgres triggers |

**Decision: build on MySQL 8 + Prisma** (matching the reference stack),
keep the schema engine-portable (no engine-specific SQL outside Prisma),
and record the two revisit-triggers above. `PRODUCTION_ROADMAP.md` is
amended accordingly.
