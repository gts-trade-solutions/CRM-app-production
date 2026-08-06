'use client';

// Role-scoped dashboard — all aggregates computed in SQL on the server.

import Link from 'next/link';
import { format, isPast, isToday } from 'date-fns';
import {
  Activity as ActivityIcon,
  Circle,
  IndianRupee,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDashboardStats } from '@/lib/api/crm-hooks';
import {
  useActivities,
  useMe,
  useToggleActivity,
} from '@/lib/api/hooks';
import { ROLE_LABELS } from '@/lib/types';
import { formatINR } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { OnboardingChecklist } from '@/components/onboarding-checklist';

const ORDINAL = ['var(--viz-ord-1)', 'var(--viz-ord-2)', 'var(--viz-ord-3)'];

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string;
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {money
            ? formatINR(p.value)
            : `${p.value} lead${p.value === 1 ? '' : 's'}`}
        </p>
      ))}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: myActivities } = useActivities({ scope: 'mine' });
  const toggle = useToggleActivity();

  if (!me) return null;

  const isRep = me.role === 'sales_rep';
  const conversionRate =
    stats && stats.leads.total > 0
      ? Math.round((stats.leads.converted / stats.leads.total) * 100)
      : 0;
  const attainment =
    stats && stats.monthTarget.target > 0
      ? Math.round(
          (stats.monthTarget.secured / stats.monthTarget.target) * 100,
        )
      : 0;

  const dueActivities = (myActivities ?? [])
    .filter(
      (a) =>
        a.kind !== 'note' &&
        !a.completedAt &&
        a.dueAt &&
        (isToday(new Date(a.dueAt)) || isPast(new Date(a.dueAt))),
    )
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .slice(0, 6);

  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {me.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isRep
            ? 'Your personal view — leads, follow-ups and pipeline you own.'
            : `${ROLE_LABELS[me.role]} view — everything in your scope.`}
        </p>
      </div>

      <OnboardingChecklist />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="Leads"
          value={String(stats.leads.total)}
          hint={`${stats.leads.online} online · ${stats.leads.offline} offline`}
        />
        <StatTile
          icon={Target}
          label="Conversion rate"
          value={`${conversionRate}%`}
          hint={`${stats.leads.converted} of ${stats.leads.total} leads converted`}
        />
        <StatTile
          icon={TrendingUp}
          label="Open pipeline"
          value={formatINR(stats.pipeline.openValue)}
          hint={`${stats.pipeline.openCount} active deal${stats.pipeline.openCount === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={IndianRupee}
          label="Revenue secured"
          value={formatINR(stats.pipeline.securedValue)}
          hint={`${stats.pipeline.securedCount} order${stats.pipeline.securedCount === 1 ? '' : 's'} secured`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Monthly target</CardTitle>
            <CardDescription>
              Orders secured this month across your scope, against your quota.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-semibold">
                {formatINR(stats.monthTarget.secured)}
              </p>
              <p className="text-sm text-muted-foreground">
                of {formatINR(stats.monthTarget.target)} · {attainment}%
              </p>
            </div>
            <div
              className="mt-3 h-3 rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.min(attainment, 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-3 rounded-full transition-all"
                style={{
                  width: `${Math.min(attainment, 100)}%`,
                  background: 'var(--viz-cat-1)',
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {attainment >= 100
                ? 'Target achieved — great month.'
                : `${formatINR(Math.max(0, stats.monthTarget.target - stats.monthTarget.secured))} to go this month.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Needs attention</CardTitle>
                <CardDescription>
                  Your overdue and due-today follow-ups.
                </CardDescription>
              </div>
              <Link
                href="/activities"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                My Day
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {dueActivities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                All caught up — nothing overdue or due today.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {dueActivities.map((a) => {
                  const overdue = !isToday(new Date(a.dueAt!));
                  return (
                    <li key={a.id} className="flex items-start gap-2.5 text-sm">
                      <button
                        onClick={() =>
                          toggle.mutate({ id: a.id, completed: true })
                        }
                        aria-label="Mark done"
                        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Circle className="h-4 w-4" />
                      </button>
                      <div className="min-w-0">
                        <p className="leading-snug">{a.subject}</p>
                        <p
                          className={
                            overdue
                              ? 'text-xs font-medium text-destructive'
                              : 'text-xs text-muted-foreground'
                          }
                        >
                          {overdue ? 'Overdue · ' : 'Today · '}
                          {format(new Date(a.dueAt!), 'd MMM, HH:mm')}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads by source</CardTitle>
            <CardDescription>
              Colored by capture channel — online vs offline.
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
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={stats.sourceData}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
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
                  content={<ChartTooltip />}
                />
                <Bar dataKey="count" barSize={14} radius={[0, 4, 4, 0]}>
                  {stats.sourceData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.channel === 'online'
                          ? 'var(--viz-cat-1)'
                          : 'var(--viz-cat-2)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue secured</CardTitle>
            <CardDescription>
              Orders secured per month, last 6 months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={288}>
              <LineChart
                data={stats.revenueByMonth}
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
                  tickFormatter={(v: number) =>
                    v >= 100000 ? `${(v / 100000).toFixed(1)}L` : String(v)
                  }
                  tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip money />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--viz-cat-1)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--viz-cat-1)' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open pipeline by stage</CardTitle>
            <CardDescription>
              Value of active deals at each stage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.stageData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    v >= 100000 ? `${(v / 100000).toFixed(1)}L` : String(v)
                  }
                  tick={{ fill: 'var(--viz-axis)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  content={<ChartTooltip money />}
                />
                <Bar dataKey="value" barSize={40} radius={[4, 4, 0, 0]}>
                  {stats.stageData.map((_, i) => (
                    <Cell key={i} fill={ORDINAL[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent activity</CardTitle>
            <CardDescription>
              Latest actions across your visible team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.recent.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <ActivityIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="leading-snug">{a.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.userName} · {format(new Date(a.at), 'd MMM, HH:mm')}
                      </p>
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
