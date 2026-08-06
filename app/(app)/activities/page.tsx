'use client';

// "My Day" — API-backed working list: overdue / due today / upcoming /
// completed, with one-click completion. Managers get a team tab.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isPast, isToday } from 'date-fns';
import {
  CalendarPlus,
  CheckCircle2,
  Circle,
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
import {
  ACTIVITY_KIND_LABELS,
  SalesActivityKind,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ActivityDialog } from '@/components/activities/activity-dialog';
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

export default function ActivitiesPage() {
  const { data: me } = useMe();
  const [scope, setScope] = useState<Scope>('mine');
  const { data: activities, isLoading } = useActivities({ scope });
  const toggle = useToggleActivity();

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
              {items.map((a) => {
                const Icon = KIND_ICONS[a.kind];
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3">
                    <button
                      onClick={() =>
                        toggle.mutate({ id: a.id, completed: !a.completedAt })
                      }
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
                            a.completedAt &&
                              'text-muted-foreground line-through',
                          )}
                        >
                          {a.subject}
                        </p>
                        <Badge variant="secondary" className="text-[10px]">
                          {ACTIVITY_KIND_LABELS[a.kind]}
                        </Badge>
                        {a.createdBy && a.createdById !== a.ownerId && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-primary"
                          >
                            Assigned by {a.createdBy.name}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.relatedHref ? (
                          <Link
                            href={a.relatedHref}
                            className="underline-offset-4 hover:text-primary hover:underline"
                          >
                            {a.relatedName}
                          </Link>
                        ) : (
                          a.relatedName
                        )}
                        {a.dueAt &&
                          ` · ${format(new Date(a.dueAt), 'd MMM, HH:mm')}`}
                        {scope === 'team' && ` · ${a.owner?.name ?? ''}`}
                      </p>
                    </div>
                  </div>
                );
              })}
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
