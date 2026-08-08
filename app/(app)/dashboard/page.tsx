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
  Pie,
  PieChart,
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

// Hue carries the channel, the step carries the source within it. Both ramps
// are validated ordinal ramps against each surface — see globals.css.
const ONLINE_RAMP = [
  'var(--viz-on-1)',
  'var(--viz-on-2)',
  'var(--viz-on-3)',
  'var(--viz-on-4)',
];
const OFFLINE_RAMP = [
  'var(--viz-off-1)',
  'var(--viz-off-2)',
  'var(--viz-off-3)',
  'var(--viz-off-4)',
  'var(--viz-off-5)',
];

interface SourceSlice {
  name: string;
  channel: string;
  count: number;
}

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
  const amount = (v: number) =>
    money ? formatINR(v) : `${v} lead${v === 1 ? '' : 's'}`;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      {label && <p className="font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {/* Donut slices and stacked segments carry their own name; axis
              charts put it in `label` instead. */}
          {!label && p.name ? `${p.name} — ${amount(p.value)}` : amount(p.value)}
        </p>
      ))}
    </div>
  );
}

/**
 * Leads by source as a donut. Slices are ordered online-first so each channel
 * forms one contiguous arc; the centre carries the headline channel split so
 * both levels read at once. The legend doubles as the table view — every
 * source, its count and its share — so identity is never colour-alone.
 */
function SourceDonut({ data }: { data: SourceSlice[] }) {
  const online = data
    .filter((d) => d.channel === 'online')
    .sort((a, b) => b.count - a.count);
  const offline = data
    .filter((d) => d.channel !== 'online')
    .sort((a, b) => b.count - a.count);

  // Ramps are finite; a source beyond the ramp reuses its darkest step rather
  // than inventing a hue. Nine sources exist and the ramps cover all of them.
  const slices = [
    ...online.map((d, i) => ({
      ...d,
      fill: ONLINE_RAMP[Math.min(i, ONLINE_RAMP.length - 1)],
    })),
    ...offline.map((d, i) => ({
      ...d,
      fill: OFFLINE_RAMP[Math.min(i, OFFLINE_RAMP.length - 1)],
    })),
  ];

  const total = slices.reduce((s, d) => s + d.count, 0);
  const onlineCount = online.reduce((s, d) => s + d.count, 0);
  const offlineCount = total - onlineCount;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const group = (label: string, rows: typeof slices, count: number) =>
    rows.length > 0 && (
      <div className="min-w-0 space-y-1">
        <p className="flex items-baseline justify-between gap-2 text-xs font-medium">
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {count} · {pct(count)}%
          </span>
        </p>
        <ul className="space-y-1">
          {rows.map((d) => (
            <li
              key={d.name}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: d.fill }}
              />
              {/* truncate needs min-w-0 — a flex item defaults to min-width
                  auto and refuses to shrink below its text, which is what
                  pushed long source names under the count. */}
              <span className="min-w-0 flex-1 truncate" title={d.name}>
                {d.name}
              </span>
              <span className="shrink-0 pl-2 tabular-nums">{d.count}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Leads by source</CardTitle>
        <CardDescription>
          Every lead you can see, split by how it was captured.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No leads captured yet.
          </p>
        ) : (
          // Wrapping rather than breakpoints: the card is half-width in the
          // dashboard grid at some sizes and full-width at others, so the
          // legend drops below the donut whenever it cannot keep its minimum
          // width.
          <div className="flex flex-wrap items-center justify-center gap-5">
            <div className="relative h-[176px] w-[176px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={84}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                  >
                    {slices.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre headline — the channel split, read without the legend. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-semibold leading-none">
                  {pct(onlineCount)}%
                </p>
                <p className="mt-0.5 text-[11px] font-medium">Online</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {pct(offlineCount)}% Offline
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {total} lead{total === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="min-w-[190px] flex-1 space-y-3">
              {group('Online', slices.slice(0, online.length), onlineCount)}
              {group('Offline', slices.slice(online.length), offlineCount)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Open pipeline as one bar split by stage — the whole open book at a glance,
 * with each stage's share of it. Values sit in the legend rather than on the
 * segments, which stay too thin to label reliably.
 */
function PipelineSplitBar({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  // One row, one key per stage — that is what makes it a single split bar
  // rather than three bars side by side. Keys are positional because stage
  // labels are admin-editable and Recharts reads a dot in a dataKey as a
  // nested path; the label rides along on the Bar's `name` instead.
  const key = (i: number) => `stage${i}`;
  const row = data.reduce<Record<string, number>>(
    (acc, d, i) => ({ ...acc, [key(i)]: d.value }),
    {},
  );
  const filled = data.filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Open pipeline by stage</CardTitle>
        <CardDescription>
          Value of active deals — {formatINR(total)} open in total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No open deals.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={64}>
              <BarChart
                data={[row]}
                layout="vertical"
                margin={{ left: 0, right: 0, top: 8, bottom: 8 }}
                barCategoryGap={0}
              >
                <XAxis type="number" hide domain={[0, total]} />
                <YAxis type="category" hide />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  content={<ChartTooltip money />}
                />
                {data.map((d, i) => {
                  // Round only the outermost filled segments so the bar reads
                  // as one object with two capped ends.
                  const isFirst = filled[0]?.name === d.name;
                  const isLast = filled[filled.length - 1]?.name === d.name;
                  return (
                    <Bar
                      key={key(i)}
                      dataKey={key(i)}
                      name={d.name}
                      stackId="pipeline"
                      fill={ORDINAL[i]}
                      barSize={40}
                      radius={[
                        isFirst ? 4 : 0,
                        isLast ? 4 : 0,
                        isLast ? 4 : 0,
                        isFirst ? 4 : 0,
                      ]}
                      // 2px surface gap between segments.
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
            <ul className="mt-3 space-y-1.5">
              {data.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: ORDINAL[i] }}
                  />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums font-medium">
                    {formatINR(d.value)}
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                    {total ? Math.round((d.value / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
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

        <SourceDonut data={stats.sourceData} />

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

        <PipelineSplitBar data={stats.stageData} />

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
