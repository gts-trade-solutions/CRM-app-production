'use client';

// "My Day" — API-backed working list: overdue / due today / upcoming /
// completed, with one-click completion. Managers get a team tab. Tasks
// spanning several leads expand into a per-lead checklist.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isPast, isToday } from 'date-fns';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Mail,
  Phone,
  StickyNote,
  CheckSquare,
  Users,
} from 'lucide-react';
import {
  WireActivity,
  useActivities,
  useMe,
  useToggleActivity,
} from '@/lib/api/hooks';
import { hasCapability } from '@/lib/policy';
import { ACTIVITY_KIND_LABELS, SalesActivityKind } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ActivityDialog } from '@/components/activities/activity-dialog';
import { CalendarSubscribeCard } from '@/components/activities/calendar-subscribe-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const KIND_ICONS: Record<
  SalesActivityKind,
  React.ComponentType<{ className?: string }>
> = {
  call: Phone,
  meeting: Users,
  task: CheckSquare,
  email: Mail,
  note: StickyNote,
};

type Scope = 'mine' | 'team';

type ToggleFn = (input: {
  id: string;
  completed: boolean;
  targetId?: string;
}) => void;

function ActivityRow({
  activity: a,
  scope,
  toggle,
  expanded,
  onToggleExpand,
}: {
  activity: WireActivity;
  scope: Scope;
  toggle: ToggleFn;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const Icon = KIND_ICONS[a.kind];
  const isMulti = a.targetsTotal > 1;

  return (
    <div className="p-3">
      <div className="flex items-start gap-3">
        <button
          onClick={() => toggle({ id: a.id, completed: !a.completedAt })}
          aria-label={a.completedAt ? 'Mark not done' : 'Mark done'}
          className="mt-0.5 text-muted-foreground transition-colors hover:text-primary"
        >
          {a.completedAt ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>
        <Icon className="mt-1 hidden h-4 w-4 text-muted-foreground sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'text-sm font-medium',
                a.completedAt && 'text-muted-foreground line-through',
              )}
            >
              {a.subject}
            </p>
            <Badge variant="secondary" className="text-[10px]">
              {ACTIVITY_KIND_LABELS[a.kind]}
            </Badge>
            {isMulti && (
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {a.targetsDone}/{a.targetsTotal} spoken to
              </Badge>
            )}
            {a.createdBy && a.createdById !== a.ownerId && (
              <Badge variant="outline" className="text-[10px] text-primary">
                Assigned by {a.createdBy.name}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isMulti ? (
              <button
                onClick={onToggleExpand}
                className="inline-flex items-center gap-0.5 underline-offset-4 hover:text-primary hover:underline"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {a.targetsTotal} leads
              </button>
            ) : a.relatedHref ? (
              <Link
                href={a.relatedHref}
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {a.relatedName}
              </Link>
            ) : (
              a.relatedName
            )}
            {a.dueAt && ` · ${format(new Date(a.dueAt), 'd MMM, HH:mm')}`}
            {scope === 'team' && ` · ${a.owner?.name ?? ''}`}
          </p>
        </div>
        {a.dueAt && (
          <a
            href={`/api/activities/${a.id}/ics`}
            download
            title="Add this one to your calendar"
            aria-label={`Add ${a.subject} to calendar`}
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>

      {isMulti && expanded && (
        <ul className="ml-8 mt-2 space-y-1 border-l pl-3">
          {a.targets.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <button
                onClick={() =>
                  toggle({
                    id: a.id,
                    completed: !t.completedAt,
                    targetId: t.id,
                  })
                }
                aria-label={
                  t.completedAt
                    ? `Mark ${t.name} not spoken to`
                    : `Mark ${t.name} spoken to`
                }
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                {t.completedAt ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>
              <Link
                href={t.href}
                className={cn(
                  'truncate underline-offset-4 hover:text-primary hover:underline',
                  t.completedAt && 'text-muted-foreground line-through',
                )}
              >
                {t.name}
              </Link>
              {t.completedAt && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {format(new Date(t.completedAt), 'd MMM')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActivitiesPage() {
  const { data: me } = useMe();
  const [scope, setScope] = useState<Scope>('mine');
  const { data: activities, isLoading } = useActivities({ scope });
  const toggle = useToggleActivity();
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const isManager = me ? hasCapability(me.role, 'assign_activities') : false;

  const groups = useMemo(() => {
    const overdue: WireActivity[] = [];
    const today: WireActivity[] = [];
    const upcoming: WireActivity[] = [];
    const done: WireActivity[] = [];
    for (const a of activities ?? []) {
      if (a.kind === 'note') continue;
      if (a.completedAt) done.push(a);
      else if (a.dueAt && isToday(new Date(a.dueAt))) today.push(a);
      else if (a.dueAt && isPast(new Date(a.dueAt))) overdue.push(a);
      else upcoming.push(a);
    }
    const byDue = (x: WireActivity, y: WireActivity) =>
      new Date(x.dueAt ?? x.createdAt).getTime() -
      new Date(y.dueAt ?? y.createdAt).getTime();
    overdue.sort(byDue);
    today.sort(byDue);
    upcoming.sort(byDue);
    done.sort((x, y) => byDue(y, x));
    return { overdue, today, upcoming, done };
  }, [activities]);

  if (!me) return null;

  function Section({
    title,
    items,
    tone,
    empty,
  }: {
    title: string;
    items: WireActivity[];
    tone?: 'destructive' | 'default';
    empty: string;
  }) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-semibold">{title}</h2>
          <Badge
            variant={
              tone === 'destructive' && items.length > 0
                ? 'destructive'
                : 'secondary'
            }
          >
            {items.length}
          </Badge>
        </div>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {items.map((a) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  scope={scope}
                  toggle={toggle.mutate}
                  expanded={expandedIds.includes(a.id)}
                  onToggleExpand={() =>
                    setExpandedIds((prev) =>
                      prev.includes(a.id)
                        ? prev.filter((x) => x !== a.id)
                        : [...prev, a.id],
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Day</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'Your follow-ups — schedule your own or assign work to your team.'
              : 'Your follow-ups — yours and any your manager assigns to you.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <TabsList>
                <TabsTrigger value="mine">Mine</TabsTrigger>
                <TabsTrigger value="team">My team</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <ActivityDialog
            trigger={
              <Button>
                <CalendarPlus />
                {isManager ? 'Schedule / assign' : 'Schedule'}
              </Button>
            }
          />
        </div>
      </div>

      <CalendarSubscribeCard />

      <Section
        title="Overdue"
        items={groups.overdue}
        tone="destructive"
        empty="Nothing overdue — great."
      />
      <Section title="Due today" items={groups.today} empty="Nothing due today." />
      <Section
        title="Upcoming"
        items={groups.upcoming}
        empty="Nothing scheduled ahead."
      />
      <Section
        title="Completed"
        items={groups.done.slice(0, 10)}
        empty="Nothing completed yet."
      />
    </div>
  );
}
