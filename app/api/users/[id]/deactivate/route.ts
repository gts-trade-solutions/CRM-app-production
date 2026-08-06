// Deactivation with handover — one transaction: open leads/deals, pending
// activities, contacts and accounts move to the successor; direct reports
// re-point; login is disabled (verifyCredentials rejects inactive users).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({ successorId: z.string() });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_users')) {
    return forbidden('Your role cannot manage members');
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const { successorId } = body.data;

  if (params.id === successorId) {
    return NextResponse.json(
      { error: 'Successor must be a different member' },
      { status: 400 },
    );
  }
  const inScope =
    ctx.actor.role === 'admin' || ctx.visible.includes(params.id);
  if (!inScope) return notFound();

  const [user, successor] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.id } }),
    prisma.user.findFirst({ where: { id: successorId, active: true } }),
  ]);
  if (!user) return notFound();
  if (user.role === 'admin') {
    return forbidden('The admin account cannot be deactivated');
  }
  if (!successor) {
    return NextResponse.json(
      { error: 'Successor not found or inactive' },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { active: false } }),
    prisma.user.updateMany({
      where: { managerId: user.id },
      data: { managerId: successorId },
    }),
    prisma.lead.updateMany({
      where: {
        ownerId: user.id,
        status: { in: ['new', 'contacted', 'qualified'] },
      },
      data: { ownerId: successorId },
    }),
    prisma.deal.updateMany({
      where: {
        ownerId: user.id,
        stage: { in: ['qualification', 'proposal', 'negotiation'] },
      },
      data: { ownerId: successorId },
    }),
    prisma.contact.updateMany({
      where: { ownerId: user.id },
      data: { ownerId: successorId },
    }),
    prisma.account.updateMany({
      where: { ownerId: user.id },
      data: { ownerId: successorId },
    }),
    prisma.salesActivity.updateMany({
      where: { ownerId: user.id, completedAt: null },
      data: { ownerId: successorId },
    }),
    prisma.notification.create({
      data: {
        userId: successorId,
        message: `${user.name}'s open records were handed over to you`,
        href: '/leads',
      },
    }),
    prisma.auditEvent.create({
      data: {
        type: 'member_deactivated',
        message: `${user.name} deactivated — open records handed to ${successor.name}`,
        actorId: ctx.actor.id,
        entity: `user:${user.id}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
