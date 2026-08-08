// Activity services: multi-record task completion, and the mapping from an
// activity to a calendar event.

import { randomBytes } from 'crypto';
import type { ActivityTarget, SalesActivity } from '@prisma/client';
import { prisma } from './db';
import type { IcsEvent } from './ics';

export const ACTIVITY_INCLUDE = {
  owner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  targets: { orderBy: { createdAt: 'asc' } },
} as const;

/**
 * A multi-record task is done exactly when every one of its records is ticked
 * off, so the parent's completion is derived rather than set by hand. Called
 * inside the same transaction as the target update.
 */
export async function syncCompletionFromTargets(
  tx: Pick<typeof prisma, 'activityTarget' | 'salesActivity'>,
  activityId: string,
): Promise<Date | null> {
  const targets = await tx.activityTarget.findMany({ where: { activityId } });
  if (targets.length === 0) return null;
  const outstanding = targets.filter((t) => t.completedAt == null);
  // The newest tick is the moment the task finished — not "now", which would
  // drift if this ever runs on a replay.
  const completedAt =
    outstanding.length > 0
      ? null
      : targets.reduce<Date>(
          (latest, t) =>
            t.completedAt && t.completedAt > latest ? t.completedAt : latest,
          targets[0].completedAt!,
        );
  await tx.salesActivity.update({
    where: { id: activityId },
    data: { completedAt },
  });
  return completedAt;
}

/**
 * Ticking the parent of a multi-record task applies to every record, so the
 * two views can never disagree about what is done.
 */
export async function setActivityCompletion(
  activityId: string,
  completed: boolean,
): Promise<SalesActivity> {
  return prisma.$transaction(async (tx) => {
    const at = completed ? new Date() : null;
    await tx.activityTarget.updateMany({
      where: { activityId },
      data: { completedAt: at },
    });
    return tx.salesActivity.update({
      where: { id: activityId },
      data: { completedAt: at },
    });
  });
}

export async function setTargetCompletion(
  activityId: string,
  targetId: string,
  completed: boolean,
): Promise<{ activity: SalesActivity; targets: ActivityTarget[] }> {
  return prisma.$transaction(async (tx) => {
    await tx.activityTarget.update({
      where: { id: targetId },
      data: { completedAt: completed ? new Date() : null },
    });
    await syncCompletionFromTargets(tx, activityId);
    const [activity, targets] = await Promise.all([
      tx.salesActivity.findUniqueOrThrow({ where: { id: activityId } }),
      tx.activityTarget.findMany({
        where: { activityId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { activity, targets };
  });
}

/** 32 bytes of entropy — this URL is the only credential the feed has. */
export function newCalendarToken(): string {
  return randomBytes(32).toString('hex');
}

export async function ensureCalendarToken(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { calendarToken: true },
  });
  if (user.calendarToken) return user.calendarToken;
  const token = newCalendarToken();
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return token;
}

const DURATION_MINUTES: Record<string, number> = {
  meeting: 60,
  call: 30,
  task: 30,
  email: 15,
  note: 15,
};

/**
 * A task only belongs on a calendar if it has a time. Undated activities are
 * to-dos, not appointments, and are left out of the feed deliberately.
 */
export function activityToEvent(
  activity: SalesActivity & { targets?: ActivityTarget[] },
  opts: { baseUrl: string; relatedNames?: string[] },
): IcsEvent | null {
  if (!activity.dueAt) return null;
  const start = activity.dueAt;
  const minutes = DURATION_MINUTES[activity.kind] ?? 30;
  const end = new Date(start.getTime() + minutes * 60_000);
  const done = activity.completedAt != null;

  const records = opts.relatedNames ?? [];
  const targetCount = activity.targets?.length ?? 0;
  const descriptionParts: string[] = [];
  if (activity.notes) descriptionParts.push(activity.notes);
  if (records.length) {
    descriptionParts.push(
      targetCount > 1
        ? `${targetCount} records:\n${records.map((n) => `• ${n}`).join('\n')}`
        : records[0],
    );
  }
  descriptionParts.push(`${opts.baseUrl}/activities`);

  return {
    // Stable per activity: an edit updates the existing calendar entry.
    uid: `activity-${activity.id}@sales-force-crm`,
    start,
    end,
    summary: `${done ? '✓ ' : ''}${activity.subject}`,
    description: descriptionParts.join('\n\n'),
    url: `${opts.baseUrl}/activities`,
    location:
      activity.lat != null && activity.lng != null
        ? `${activity.lat},${activity.lng}`
        : undefined,
    reminderMinutes: done ? undefined : 30,
  };
}
