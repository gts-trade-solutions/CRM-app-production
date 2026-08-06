'use client';

// "My Day": the rep's working list — overdue, due today, upcoming and
// completed activities. Managers can flip to their team's activities.

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
import { useStore } from '@/lib/store';
import { subordinateIds } from '@/lib/rbac';
import {
  ACTIVITY_KIND_LABELS,
  SalesActivity,
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
  const { state, currentUser, toggleActivityComplete } = useStore();
  const [scope, setScope] = useState<Scope>('mine');

  const teamIds = useMemo(
    () =>
      currentUser ? subordinateIds(state.users, currentUser.id) : [],
    [state.users, currentUser],
  );

  const groups = useMemo(() => {
    if (!currentUser)
      return { overdue: [], today: [], upcoming: [], done: [], notes: [] } as Record<string, SalesActivity[]>;
    const ownerSet =
      scope === 'mine'
        ? new Set([currentUser.id])
        : new Set(teamIds);
    const mine = state.salesActivities.filter((a) => ownerSet.has(a.ownerId));

    const overdue: SalesActivity[] = [];
    const today: SalesActivity[] = [];
    const upcoming: SalesActivity[] = [];
    const done: SalesActivity[] = [];
    const notes: SalesActivity[] = [];

    for (const a of mine) {
      if (a.kind === 'note') {
        notes.push(a);
      } else if (a.completedAt) {
        done.push(a);
      } else if (a.dueAt && isToday(new Date(a.dueAt))) {
        today.push(a);
      } else if (a.dueAt && isPast(new Date(a.dueAt))) {
        overdue.push(a);
      } else {
        upcoming.push(a);
      }
    }
    const byDue = (x: SalesActivity, y: SalesActivity) =>
      new Date(x.dueAt ?? x.createdAt).getTime() -
      new Date(y.dueAt ?? y.createdAt).getTime();
    overdue.sort(byDue);
    today.sort(byDue);
    upcoming.sort(byDue);
    done.sort((x, y) => byDue(y, x));
    notes.sort((x, y) => byDue(y, x));
    return { overdue, today, upcoming, done, notes };
  }, [state.salesActivities, currentUser, scope, teamIds]);

  if (!currentUser) return null;

  const relatedInfo = (a: SalesActivity): { name: string; href: string } => {
    if (a.relatedType === 'lead') {
      const l = state.leads.find((x) => x.id === a.relatedId);
      return { name: l ? `${l.name} (lead)` : 'Lead', href: `/leads/${a.relatedId}` };
    }
    if (a.relatedType === 'deal') {
      const d = state.deals.find((x) => x.id === a.relatedId);
      return { name: d ? d.title : 'Deal', href: `/pipeline/${a.relatedId}` };
    }
    const c = state.contacts.find((x) => x.id === a.relatedId);
    return { name: c ? `${c.name} (contact)` : 'Contact', href: '/contacts' };
  };

  const userById = new Map(state.users.map((u) => [u.id, u]));

  function Section({
    title,
    items,
    tone,
    empty,
  }: {
    title: string;
    items: SalesActivity[];
    tone?: 'destructive' | 'default';
    empty: string;
  }) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-semibold">{title}</h2>
          <Badge
            variant={tone === 'destructive' && items.length > 0 ? 'destructive' : 'secondary'}
          >
            {items.length}
          </Badge>
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {items.map((a) => {
                const Icon = KIND_ICONS[a.kind];
                const related = relatedInfo(a);
                const completable = a.kind !== 'note';
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3">
                    {completable ? (
                      <button
                        onClick={() => toggleActivityComplete(a.id)}
                        aria-label={a.completedAt ? 'Mark not done' : 'Mark done'}
                        className="mt-0.5 text-muted-foreground transition-colors hover:text-primary"
                      >
                        {a.completedAt ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>
                    ) : (
                      <Icon className="mt-1 h-4 w-4 text-muted-foreground" />
                    )}
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
                        {a.createdById && a.createdById !== a.ownerId && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-primary"
                          >
                            Assigned by{' '}
                            {userById.get(a.createdById)?.name ?? '—'}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <Link
                          href={related.href}
                          className="underline-offset-4 hover:text-primary hover:underline"
                        >
                          {related.name}
                        </Link>
                        {a.dueAt &&
                          ` · ${format(new Date(a.dueAt), 'd MMM, HH:mm')}`}
                        {scope === 'team' &&
                          ` · ${userById.get(a.ownerId)?.name ?? ''}`}
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
            {teamIds.length > 0
              ? 'Your follow-ups — schedule your own or assign work to your team.'
              : 'Your follow-ups — yours and any your manager assigns to you.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {teamIds.length > 0 && (
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
                {teamIds.length > 0 ? 'Schedule / assign' : 'Schedule'}
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
      <Section
        title="Due today"
        items={groups.today}
        empty="Nothing due today."
      />
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
