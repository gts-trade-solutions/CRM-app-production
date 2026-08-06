'use client';

// Reports — server-side aggregates with period filtering; the forecast is
// computed over the live deals list with DB-driven stage weights. CSV
// exports pull the full scoped datasets.

import { useState } from 'react';
import { format } from 'date-fns';
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
import {
  useDeals,
  useReportStats,
  useStageConfig,
} from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { DealStage } from '@/lib/types';
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

type Period = 'month' | 'quarter' | '6m' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  month: 'This month',
  quarter: 'This quarter',
  '6m': 'Last 6 months',
  all: 'All time',
};

function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows]
    .map((r) => r.map(escape).join(','))
    .join('\r\n');
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
  payload?: Array<{ value: number; dataKey?: string }>;
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

interface ExportLead {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  owner?: { name: string };
  estimatedValue: number;
  createdAt: string;
}

export default function ReportsPage() {
  const { data: me } = useMe();
  const [period, setPeriod] = useState<Period>('all');
  const { data: stats, isLoading } = useReportStats(period);
  const { data: deals } = useDeals();
  const stages = useStageConfig();

  if (!me) return null;

  const openStages: DealStage[] = ['qualification', 'proposal', 'negotiation'];
  const forecastRows = openStages.map((stage) => {
    const stageDeals = (deals ?? []).filter((d) => d.stage === stage);
    const gross = stageDeals.reduce((s, d) => s + d.value, 0);
    return {
      stage,
      count: stageDeals.length,
      gross,
      weighted: Math.round(gross * stages[stage].weight),
    };
  });
  const totalGross = forecastRows.reduce((s, r) => s + r.gross, 0);
  const totalWeighted = forecastRows.reduce((s, r) => s + r.weighted, 0);

  async function exportLeads() {
    const all: ExportLead[] = [];
    let page = 1;
    for (;;) {
      const res = await api<{
        total: number;
        pageSize: number;
        leads: ExportLead[];
      }>(`/api/leads?page=${page}&pageSize=100`);
      all.push(...res.leads);
      if (page * res.pageSize >= res.total) break;
      page++;
    }
    downloadCsv(
      'leads.csv',
      ['Name', 'Company', 'Phone', 'Email', 'Source', 'Status', 'Owner', 'Est. value', 'Created'],
      all.map((l) => [
        l.name,
        l.company,
        l.phone,
        l.email,
        l.source,
        l.status,
        l.owner?.name ?? '',
        l.estimatedValue,
        format(new Date(l.createdAt), 'yyyy-MM-dd'),
      ]),
    );
  }

  function exportDeals() {
    downloadCsv(
      'deals.csv',
      ['Title', 'Contact', 'Owner', 'Stage', 'Value', 'Created', 'Closed', 'Lost reason'],
      (deals ?? []).map((d) => [
        d.title,
        d.contact?.name ?? '',
        d.owner?.name ?? '',
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
            Performance across your visible scope.
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
            Stage-weighted open pipeline — always the current book,
            probabilities from pipeline settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                {forecastRows.map((r) => (
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
        </CardContent>
      </Card>

      {isLoading || !stats ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Secured revenue leaderboard
              </CardTitle>
              <CardDescription>
                Secured order value per member ({PERIOD_LABELS[period]}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.leaderboard.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No secured orders in scope for this period.
                </p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(180, stats.leaderboard.length * 44)}
                >
                  <BarChart
                    data={stats.leaderboard}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke="var(--viz-grid)"
                    />
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
                <BarChart
                  data={stats.channelTrend}
                  margin={{ left: 8, right: 16 }}
                >
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
                Conversion rate from lead to deal, per source (
                {PERIOD_LABELS[period]}).
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
                  {stats.sourceRows.map((r) => (
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
                Why orders in your scope were lost ({PERIOD_LABELS[period]}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.lostReasons.rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No lost orders in scope — nothing to learn from yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {stats.lostReasons.rows.map((r) => (
                    <li key={r.reason}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{r.reason}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.count} order{r.count > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${(r.count / stats.lostReasons.total) * 100}%`,
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
      )}
    </div>
  );
}
