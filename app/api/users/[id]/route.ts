// Member edit — manage_users capability, scoped to the actor's subtree
// (admins reach everyone).

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
import { serializeUser } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z
    .enum(['admin', 'regional_manager', 'team_lead', 'sales_rep'])
    .optional(),
  managerId: z.string().nullable().optional(),
  region: z.string().optional(),
  title: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_users')) {
    return forbidden('Your role cannot manage members');
  }
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  // Non-admins may only edit inside their own subtree.
  const inScope =
    ctx.actor.role === 'admin' || ctx.visible.includes(params.id);
  if (!target || !inScope) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;

  const user = await prisma.user.update({
    where: { id: params.id },
    data: body.data,
  });
  await prisma.auditEvent.create({
    data: {
      type: 'member_updated',
      message: `${user.name}'s profile updated`,
      actorId: ctx.actor.id,
      entity: `user:${user.id}`,
    },
  });
  return NextResponse.json({ user: serializeUser(user) });
}
