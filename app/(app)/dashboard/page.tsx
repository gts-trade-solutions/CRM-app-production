'use client';

// Role-scoped dashboard: every number is computed over the records the
// signed-in user is allowed to see (self + everyone below in the hierarchy).

import { useMemo } from 'react';
import Link from 'next/link';
import {
  format,
  isPast,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from 'date-fns';
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
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
import { LeadSource, ROLE_LABELS, SOURCE_CONFIG } from '@/lib/types';
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
          {money ? formatINR(p.value) : `${p.value} lead${p.value === 1 ? '' : 's'}`}
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
  const { state, currentUser, stages, toggleActivityComplete } = useStore();

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  const leads = useMemo(
    () => state.leads.filter((l) => visible.has(l.ownerId)),
    [state.leads, visible],
  );
  const deals = useMemo(
    () => state.deals.filter((d) => visible.has(d.ownerId) && !d.archived),
    [state.deals, visible],
  );

  const openDeals = deals.filter(
    (d) => d.stage !== 'won' && d.stage !== 'lost',
  );
  const wonDeals = deals.filter((d) => d.stage === 'won');
  const openValue = openDeals.reduce((s, d) => s + d.value, 0);
  const wonValue = wonDeals.reduce((s, d) => s + d.value, 0);
  const convertedCount = leads.filter((l) => l.status === 'converted').length;
  const conversionRate =
    leads.length > 0 ? Math.round((convertedCount / leads.length) * 100) : 0;

  // Leads by source, colored by channel (online = blue, offline = orange).
  const sourceData = useMemo(() => {
    const counts = new Map<LeadSource, number>();
    for (const l of leads) {
      counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([source, count]) => ({
        name: SOURCE_CONFIG[source].label,
        channel: SOURCE_CONFIG[source].channel,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const onlineCount = leads.filter(
    (l) => SOURCE_CONFIG[l.source].channel === 'online',
  ).length;
  const offlineCount = leads.length - onlineCount;

  // Won revenue per month, last 6 months.
  const revenueData = useMemo(() => {
    const months: { key: string; name: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      months.push({ key: format(d, 'yyyy-MM'), name: format(d, 'MMM'), value: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const deal of wonDeals) {
      if (!deal.closedAt) continue;
      const key = format(new Date(deal.closedAt), 'yyyy-MM');
      const bucket = byKey.get(key);
      if (bucket) bucket.value += deal.value;
    }
    return months;
  }, [wonDeals]);

  // Open pipeline value by stage (ordinal ramp).
  const stageData = useMemo(() => {
    const keys = ['qualification', 'proposal', 'negotiation'] as const;
    return keys.map((key) => ({
      name: stages[key].label,
      value: openDeals
        .filter((d) => d.stage === key)
        .reduce((sum, d) => sum + d.value, 0),
    }));
  }, [openDeals, stages]);

  // Monthly quota attainment: won value in scope this month vs own target.
  const monthWon = useMemo(
    () =>
      wonDeals
        .filter(
          (d) => d.closedAt && isSameMonth(new Date(d.closedAt), new Date()),
        )
        .reduce((s, d) => s + d.value, 0),
    [wonDeals],
  );
  const target = currentUser ? state.targets[currentUser.id] ?? 0 : 0;
  const attainment = target > 0 ? Math.round((monthWon / target) * 100) : 0;

  // The rep's working list: own overdue + due-today activities.
  const dueActivities = useMemo(() => {
    if (!currentUser) return [];
    return state.salesActivities
      .filter(
        (a) =>
          a.ownerId === currentUser.id &&
          a.kind !== 'note' &&
          !a.completedAt &&
          a.dueAt &&
          (isToday(new Date(a.dueAt)) || isPast(new Date(a.dueAt))),
      )
      .sort(
        (a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime(),
      )
      .slice(0, 6);
  }, [state.salesActivities, currentUser]);

  const recentActivities = useMemo(() => {
    const userById = new Map(state.users.map((u) => [u.id, u]));
    return state.activities
      .filter((a) => visible.has(a.userId))
      .slice(0, 8)
      .map((a) => ({ ...a, userName: userById.get(a.userId)?.name ?? '—' }));
  }, [state.activities, state.users, visible]);

  if (!currentUser) return null;

  const isRep = currentUser.role === 'sales_rep';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {currentUser.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isRep
            ? 'Your personal view — leads, follow-ups and pipeline you own.'
            : `${ROLE_LABELS[currentUser.role]} view — ${visible.size} workforce member${visible.size > 1 ? 's' : ''} in scope.`}
        </p>
      </div>

      <OnboardingChecklist />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="Leads"
          value={String(leads.length)}
          hint={`${onlineCount} online · ${offlineCount} offline`}
        />
        <StatTile
          icon={Target}
          label="Conversion rate"
          value={`${conversionRate}%`}
          hint={`${convertedCount} of ${leads.length} leads converted`}
        />
        <StatTile
          icon={TrendingUp}
          label="Open pipeline"
          value={formatINR(openValue)}
          hint={`${openDeals.length} active deal${openDeals.length === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={IndianRupee}
          label="Revenue secured"
          value={formatINR(wonValue)}
          hint={`${wonDeals.length} order${wonDeals.length === 1 ? '' : 's'} secured`}
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
              <p className="text-2xl font-semibold">{formatINR(monthWon)}</p>
              <p className="text-sm text-muted-foreground">
                of {formatINR(target)} · {attainment}%
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
                : `${formatINR(Math.max(0, target - monthWon))} to go this month.`}
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
                        onClick={() => toggleActivityComplete(a.id)}
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
                data={sourceData}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--viz-grid)"
                />
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
                  {sourceData.map((entry, i) => (
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
              <LineChart data={revenueData} margin={{ left: 8, right: 16 }}>
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
              <BarChart data={stageData} margin={{ left: 8, right: 16 }}>
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
                  {stageData.map((_, i) => (
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
            {recentActivities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {recentActivities.map((a) => (
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
