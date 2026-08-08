// Multi-record task guarantees against the real database: a task spanning
// several leads completes exactly when the last one is ticked off, un-ticking
// reopens it, and ticking the parent settles every record at once.

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import {
  setActivityCompletion,
  setTargetCompletion,
} from '@/lib/server/activities';

const created: { activityIds: string[]; leadIds: string[] } = {
  activityIds: [],
  leadIds: [],
};

async function makeLeads(ownerId: string, n: number) {
  const leads = [];
  for (let i = 0; i < n; i++) {
    const lead = await prisma.lead.create({
      data: {
        name: `IT MultiTask Lead ${i} ${Date.now()}-${Math.random()}`,
        company: 'IT MultiTask Co',
        phone: `+91 90000000${i}`,
        email: `it-multitask-${i}-${Date.now()}@example.test`,
        source: 'phone',
        ownerId,
        notes: '',
      },
    });
    created.leadIds.push(lead.id);
    leads.push(lead);
  }
  return leads;
}

async function makeTask(ownerId: string, leadIds: string[]) {
  const activity = await prisma.salesActivity.create({
    data: {
      kind: 'call',
      subject: `IT MultiTask call round ${Date.now()}`,
      notes: '',
      relatedType: 'lead',
      relatedId: leadIds[0],
      ownerId,
      dueAt: new Date(Date.now() + 86400_000),
      targets: {
        create: leadIds.map((id) => ({ relatedType: 'lead', relatedId: id })),
      },
    },
    include: { targets: { orderBy: { createdAt: 'asc' } } },
  });
  created.activityIds.push(activity.id);
  return activity;
}

afterAll(async () => {
  await prisma.activityTarget.deleteMany({
    where: { activityId: { in: created.activityIds } },
  });
  await prisma.salesActivity.deleteMany({
    where: { id: { in: created.activityIds } },
  });
  await prisma.lead.deleteMany({ where: { id: { in: created.leadIds } } });
  await prisma.$disconnect();
});

describe('multi-record tasks', () => {
  it('stays open until every record is ticked, then completes', async () => {
    const owner = await prisma.user.findFirstOrThrow({
      where: { role: 'sales_rep', active: true },
    });
    const leads = await makeLeads(owner.id, 3);
    const task = await makeTask(
      owner.id,
      leads.map((l) => l.id),
    );

    expect(task.completedAt).toBeNull();
    expect(task.targets).toHaveLength(3);

    const first = await setTargetCompletion(task.id, task.targets[0].id, true);
    expect(first.activity.completedAt).toBeNull();
    expect(first.targets.filter((t) => t.completedAt).length).toBe(1);

    await setTargetCompletion(task.id, task.targets[1].id, true);
    const last = await setTargetCompletion(task.id, task.targets[2].id, true);

    expect(last.activity.completedAt).not.toBeNull();
    expect(last.targets.every((t) => t.completedAt !== null)).toBe(true);
  });

  it('reopens when a completed record is un-ticked', async () => {
    const owner = await prisma.user.findFirstOrThrow({
      where: { role: 'sales_rep', active: true },
    });
    const leads = await makeLeads(owner.id, 2);
    const task = await makeTask(
      owner.id,
      leads.map((l) => l.id),
    );

    await setTargetCompletion(task.id, task.targets[0].id, true);
    const done = await setTargetCompletion(task.id, task.targets[1].id, true);
    expect(done.activity.completedAt).not.toBeNull();

    const reopened = await setTargetCompletion(
      task.id,
      task.targets[1].id,
      false,
    );
    expect(reopened.activity.completedAt).toBeNull();
  });

  it('ticking the whole task settles every record', async () => {
    const owner = await prisma.user.findFirstOrThrow({
      where: { role: 'sales_rep', active: true },
    });
    const leads = await makeLeads(owner.id, 4);
    const task = await makeTask(
      owner.id,
      leads.map((l) => l.id),
    );

    const activity = await setActivityCompletion(task.id, true);
    expect(activity.completedAt).not.toBeNull();
    const targets = await prisma.activityTarget.findMany({
      where: { activityId: task.id },
    });
    expect(targets.every((t) => t.completedAt !== null)).toBe(true);

    await setActivityCompletion(task.id, false);
    const reopened = await prisma.activityTarget.findMany({
      where: { activityId: task.id },
    });
    expect(reopened.every((t) => t.completedAt === null)).toBe(true);
  });

  it('completion time is the last tick, not the moment of the call', async () => {
    const owner = await prisma.user.findFirstOrThrow({
      where: { role: 'sales_rep', active: true },
    });
    const leads = await makeLeads(owner.id, 2);
    const task = await makeTask(
      owner.id,
      leads.map((l) => l.id),
    );

    await setTargetCompletion(task.id, task.targets[0].id, true);
    const result = await setTargetCompletion(task.id, task.targets[1].id, true);
    const latestTick = result.targets
      .map((t) => t.completedAt!.getTime())
      .sort((a, b) => b - a)[0];
    expect(result.activity.completedAt!.getTime()).toBe(latestTick);
  });
});
