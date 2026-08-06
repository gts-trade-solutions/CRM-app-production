'use client';

// Chronological activity list for a single lead/deal/contact, with a
// complete/undo toggle on scheduled items.

import { format, isPast } from 'date-fns';
import {
  CheckCircle2,
  Circle,
  Mail,
  MapPin,
  Phone,
  StickyNote,
  CheckSquare,
  Users,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import {
  ACTIVITY_KIND_LABELS,
  SalesActivity,
  SalesActivityKind,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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

export function ActivityTimeline({
  relatedType,
  relatedId,
}: {
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
}) {
  const { state, toggleActivityComplete } = useStore();
  const userById = new Map(state.users.map((u) => [u.id, u]));

  const items = state.salesActivities
    .filter((a) => a.relatedType === relatedType && a.relatedId === relatedId)
    .sort(
      (a, b) =>
        new Date(b.dueAt ?? b.createdAt).getTime() -
        new Date(a.dueAt ?? a.createdAt).getTime(),
    );

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No activities logged yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((a: SalesActivity) => {
        const Icon = KIND_ICONS[a.kind];
        const overdue =
          !a.completedAt && a.dueAt && isPast(new Date(a.dueAt));
        const schedulable = a.kind !== 'note';
        return (
          <li key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
            {schedulable ? (
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
              <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
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
                {overdue && (
                  <Badge variant="destructive" className="text-[10px]">
                    Overdue
                  </Badge>
                )}
              </div>
              {a.notes && (
                <p className="mt-0.5 text-sm text-muted-foreground">{a.notes}</p>
              )}
              {a.location && (
                <a
                  href={`https://maps.google.com/?q=${a.location.lat},${a.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  Checked in at {a.location.lat}, {a.location.lng}
                </a>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {userById.get(a.ownerId)?.name ?? '—'}
                {a.createdById &&
                  a.createdById !== a.ownerId &&
                  ` · assigned by ${userById.get(a.createdById)?.name ?? '—'}`}
                {a.dueAt &&
                  ` · due ${format(new Date(a.dueAt), 'd MMM, HH:mm')}`}
                {a.completedAt &&
                  ` · done ${format(new Date(a.completedAt), 'd MMM')}`}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
