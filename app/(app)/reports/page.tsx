'use client';

// Reports: rep leaderboard, lead channel trend, source performance and
// lost-deal reasons — all scoped to the signed-in user's hierarchy slice —
// plus CSV exports of the underlying data.

import { useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  startOfQuarter,
  subMonths,
} from 'date-fns';
import { Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
import { DealStage, LeadSource, SOURCE_CONFIG } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{formatINR(payload[0].value)}</p>
    </div>
  );
}

function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.dataKey === 'online' ? 'Online' : 'Offline'}: {p.value}
        </p>
      ))}
    </div>
  );
}

type Period = 'month' | 'quarter' | '6m' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This month',
  quarter: 'This quarter',
  '6m': 'Last 6 months',
  all: 'All time',
};

function periodStart(period: Period): Date | null {
  const now = new Date();
  if (period === 'month') return startOfMonth(now);
  if (period === 'quarter') return startOfQuarter(now);
  if (period === '6m') return startOfMonth(subMonths(now, 5));
  return null;
}

export default function ReportsPage() {
  const { state, currentUser, stages } = useStore();
  const [period, setPeriod] = useState<Period>('all');

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  const allLeads = useMemo(
    () => state.leads.filter((l) => visible.has(l.ownerId)),
    [state.leads, visible],
  );
  const allDeals = useMemo(
    () => state.deals.filter((d) => visible.has(d.ownerId) && !d.archived),
    [state.deals, visible],
  );

  // Period filter: leads by capture date; closed deals by close date.
  // Open-pipeline views (forecast) always reflect the current book.
  const cutoff = periodStart(period);
  const leads = useMemo(
    () =>
      cutoff
        ? allLeads.filter((l) => new Date(l.createdAt) >= cutoff)
        : allLeads,
    [allLeads, cutoff],
  );
  const deals = useMemo(
    () =>
      cutoff
        ? allDeals.filter((d) => {
            if (d.stage === 'won' || d.stage === 'lost') {
              return d.closedAt ? new Date(d.closedAt) >= cutoff : false;
            }
            return true;
          })
        : allDeals,
    [allDeals, cutoff],
  );
  const userById = useMemo(
    () => new Map(state.users.map((u) => [u.id, u])),
    [state.users],
  );

  // Rep leaderboard: won revenue per owner.
  const leaderboard = useMemo(() => {
    const byOwner = new Map<string, number>();
    for (const d of deals) {
      if (d.stage !== 'won') continue;
      byOwner.set(d.ownerId, (byOwner.get(d.ownerId) ?? 0) + d.value);
    }
    return Array.from(byOwner.entries())
      .map(([ownerId, value]) => ({
        name: userById.get(ownerId)?.name ?? '—',
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [deals, userById]);

  // Lead volume per month by channel, last 6 months.
  const channelTrend = useMemo(() => {
    const months: { key: string; name: string; online: number; offline: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      months.push({
        key: format(d, 'yyyy-MM'),
        name: format(d, 'MMM'),
        online: 0,
        offline: 0,
      });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const l of leads) {
      const bucket = byKey.get(format(new Date(l.createdAt), 'yyyy-MM'));
      if (!bucket) continue;
      bucket[SOURCE_CONFIG[l.source].channel] += 1;
    }
    return months;
  }, [leads]);

  // Source performance table.
  const sourceRows = useMemo(() => {
    const rows = new Map<
      LeadSource,
      { leads: number; converted: number }
    >();
    for (const l of leads) {
      const r = rows.get(l.source) ?? { leads: 0, converted: 0 };
      r.leads += 1;
      if (l.status === 'converted') r.converted += 1;
      rows.set(l.source, r);
    }
    return Array.from(rows.entries())
      .map(([source, r]) => ({
        source,
        label: SOURCE_CONFIG[source].label,
        channel: SOURCE_CONFIG[source].channel,
        ...r,
        rate: r.leads ? Math.round((r.converted / r.leads) * 100) : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [leads]);

  // Lost reasons.
  const lostReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      if (d.stage !== 'lost') continue;
      const reason = d.lostReason?.trim() || 'No reason recorded';
      map.set(reason, (map.get(reason) ?? 0) + 1);
    }
    const total = Array.from(map.values()).reduce((s, n) => s + n, 0);
    return {
      total,
      rows: Array.from(map.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [deals]);

  if (!currentUser) return null;

  function exportLeads() {
    downloadCsv(
      'leads.csv',
      ['Name', 'Company', 'Phone', 'Email', 'Source', 'Channel', 'Status', 'Owner', 'Est. value', 'Created'],
      leads.map((l) => [
        l.name,
        l.company,
        l.phone,
        l.email,
        SOURCE_CONFIG[l.source].label,
        SOURCE_CONFIG[l.source].channel,
        l.status,
        userById.get(l.ownerId)?.name ?? '',
        l.estimatedValue,
        format(new Date(l.createdAt), 'yyyy-MM-dd'),
      ]),
    );
  }

  function exportDeals() {
    const contactById = new Map(state.contacts.map((c) => [c.id, c]));
    downloadCsv(
      'deals.csv',
      ['Title', 'Contact', 'Owner', 'Stage', 'Value', 'Created', 'Closed', 'Lost reason'],
      deals.map((d) => [
        d.title,
        contactById.get(d.contactId)?.name ?? '',
        userById.get(d.ownerId)?.name ?? '',
        stages[d.stage].label,
        d.value,
        format(new Date(d.createdAt), 'yyyy-MM-dd'),
        d.closedAt ? format(new Date(d.closedAt), 'yyyy-MM-dd') : '',
        d.lostReason ?? '',
      ]),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Performance across your visible scope ({visible.size} member
            {visible.size > 1 ? 's' : ''}).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportLeads}>
            <Download />
            Leads CSV
          </Button>
          <Button variant="outline" onClick={exportDeals}>
            <Download />
            Deals CSV
          </Button>
        </div>
      </div>

      {/* Stage-weighted forecast */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Sales forecast</CardTitle>
          <CardDescription>
            Stage-weighted pipeline: open deal value × likelihood of closing
            at that stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const openStages: DealStage[] = [
              'qualification',
              'proposal',
              'negotiation',
            ];
            const rows = openStages.map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage);
              const gross = stageDeals.reduce((s, d) => s + d.value, 0);
              return {
                stage,
                count: stageDeals.length,
                gross,
                weighted: Math.round(gross * stages[stage].weight),
              };
            });
            const totalGross = rows.reduce((s, r) => s + r.gross, 0);
            const totalWeighted = rows.reduce((s, r) => s + r.weighted, 0);
            return (
              <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                <div className="rounded-lg bg-muted/60 p-4">
                  <p className="text-sm text-muted-foreground">
                    Weighted forecast
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {formatINR(totalWeighted)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    from {formatINR(totalGross)} open pipeline
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Deals</TableHead>
                      <TableHead className="text-right">Pipeline</TableHead>
                      <TableHead className="text-right">Probability</TableHead>
                      <TableHead className="text-right">Weighted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.stage}>
                        <TableCell className="font-medium">
                          {stages[r.stage].label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(r.gross)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.round(stages[r.stage].weight * 100)}%
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatINR(r.weighted)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Secured revenue leaderboard</CardTitle>
            <CardDescription>
              All-time secured order value per member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No secured orders in scope yet.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(180, leaderboard.length * 44)}
              >
                <BarChart
                  data={leaderboard}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) =>
                      v >= 100000 ? `${(v / 100000).toFixed(1)}L` : String(v)
                    }
                    tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    content={<MoneyTooltip />}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--viz-cat-1)"
                    barSize={14}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lead volume by channel</CardTitle>
            <CardDescription>
              Online vs offline capture, last 6 months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: 'var(--viz-cat-1)' }}
                />
                Online
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: 'var(--viz-cat-2)' }}
                />
                Offline
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={channelTrend} margin={{ left: 8, right: 16 }}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  content={<CountTooltip />}
                />
                <Bar
                  dataKey="online"
                  fill="var(--viz-cat-1)"
                  barSize={14}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="offline"
                  fill="var(--viz-cat-2)"
                  barSize={14}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Source performance</CardTitle>
            <CardDescription>
              Conversion rate from lead to deal, per source.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Converted</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRows.map((r) => (
                  <TableRow key={r.source}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background:
                              r.channel === 'online'
                                ? 'var(--viz-cat-1)'
                                : 'var(--viz-cat-2)',
                          }}
                        />
                        {r.channel === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.leads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.converted}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.rate}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lost order reasons</CardTitle>
            <CardDescription>
              Why orders in your scope were lost.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lostReasons.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No lost orders in scope — nothing to learn from yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {lostReasons.rows.map((r) => (
                  <li key={r.reason}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{r.reason}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {r.count} deal{r.count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(r.count / lostReasons.total) * 100}%`,
                          background: 'var(--viz-cat-1)',
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
