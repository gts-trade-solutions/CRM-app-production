# SalesForce MVP — Frontend

A frontend-only MVP for a sales workforce CRM, built with the Next.js App
Router. Configuration and library versions mirror the madenkorea-production
reference app (Next 14.2.35, React 18.2, TypeScript 5.2, Tailwind 3.3 +
shadcn/ui conventions).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run typecheck
```

## What it covers

### 1. Hierarchy-based workforce & access
Four levels: **Sales Head → Regional Manager → Team Lead → Sales Rep**.
Visibility flows down the management chain — every user sees their own
records plus everything owned by their direct and indirect reports
(`lib/rbac.ts`). All pages (dashboard, leads, contacts, pipeline, team)
filter through this. Managers can add workforce members at levels strictly
below their own on the Team page.

Sign in as any member on the login screen to experience that level's view
(mock auth — swap for NextAuth/etc. later).

### 2. Leads — online and offline
- Every lead carries a **source** tagged as an *online* channel (website,
  social, email campaign, marketplace) or *offline* channel (walk-in, phone,
  field visit, event, referral).
- **Offline capture**: if the device loses connectivity, new leads are queued
  locally (`pendingSync`) and flushed automatically when the browser comes
  back online — with a visible "pending sync" badge in the topbar and on
  lead rows. Try it with browser DevTools → Network → Offline.
- Lead lifecycle: New → Contacted → Qualified → Converted / Disqualified.

### 3. Full pipeline — contact to sale
- Qualified leads **convert** into a Contact + a Deal (Qualification stage).
- The **Pipeline** page is a drag-and-drop kanban:
  Qualification → Proposal → Negotiation → Won / Lost (lost requires a
  reason). Each card also has a fallback "move to" menu for touch devices.
- Won deals feed the revenue KPIs and the monthly revenue chart on the
  dashboard.

### 4. Demo "bells and whistles"
- **Activities / My Day** — calls, meetings, tasks and notes logged against
  leads, deals and contacts; overdue / due-today / upcoming buckets; managers
  can flip to their team's list.
- **Detail pages** — every lead and deal has a full workspace page with an
  activity timeline.
- **Products & quotation** — a product catalogue; deal line items drive the
  deal value automatically.
- **Targets & attainment** — monthly quota per member with progress bars on
  the dashboard and the team tree (manager quotas roll up their subtree).
- **Reports** — won-revenue leaderboard, online/offline lead trend, source
  win-rate table, lost-reason breakdown, CSV export of leads and deals.
- **Notifications** — in-app bell: lead assignments, stage moves on your
  deals, closed-won alerts to the owner's manager.
- **Global search** — Ctrl+K across leads, contacts and deals in scope.
- **Auto-assignment** — round-robin lead routing across the reps in the
  creator's scope, plus duplicate detection on phone/email at capture time.

### 5. CRM structure (Salesforce-style)
- **Accounts** — companies as first-class records with contacts and deal
  rollups (open pipeline / won). Converting a lead auto-matches or creates
  the account from the lead's company name.
- **Campaigns** — leads are attributed to online/offline campaigns; each
  campaign card shows its funnel (leads → converted → pipeline → won) and
  return against budget.
- **Sales forecast** — stage-weighted pipeline on the Reports page
  (qualification 30% / proposal 50% / negotiation 75%).
- **Email compose** — a demo composer on lead and deal pages that logs the
  email to the record's timeline (no real send; swap in SES/SendGrid later).

### 6. Demo differentiators
- **Lead scoring** — transparent rule-based 0–100 score (source quality,
  value, freshness, engagement, qualification) with Hot/Warm/Cold badges
  and score sorting.
- **CSV bulk import** — spreadsheet migration with header detection,
  preview and automatic duplicate skipping.
- **WhatsApp click-to-chat** — prefilled `wa.me` links on leads, contacts
  and deals.
- **Printable quotation** — `/quote/<dealId>`: a clean GST-style quote from
  the deal's line items (print / save as PDF).
- **Geo check-in** — capture location when logging field activities; shown
  as a Google Maps link on timelines.
- **Report periods** — this month / quarter / 6 months / all-time filter.

## Architecture notes

- **Data layer**: `lib/store.tsx` — React context backed by localStorage,
  seeded from `lib/mock-data.ts`. Every store mutation maps 1:1 to a future
  backend endpoint; `lib/types.ts` doubles as the API contract.
- **Access control**: `lib/rbac.ts` — pure functions over the user tree
  (`visibleUserIds`, `assignableUsers`, `creatableRoles`).
- **UI**: shadcn/ui-style components in `components/ui`, Radix primitives,
  lucide icons, sonner toasts, next-themes dark mode, Recharts dashboards,
  dnd-kit kanban.
- Reset the demo data anytime from the avatar menu in the topbar.
