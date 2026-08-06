import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashSync } from 'bcryptjs';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import { ROLE_LEVEL, Role } from '@/lib/types';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeUser } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

/** Users in the actor's visibility scope (owner selects, team views). */
export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const users = await prisma.user.findMany({
    where: { id: { in: ctx.visible } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ users: users.map(serializeUser) });
}

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['regional_manager', 'team_lead', 'sales_rep']),
  managerId: z.string(),
  region: z.string().min(1),
  title: z.string().min(2),
});

/**
 * Add a workforce member. Role must be strictly below the creator's; the
 * manager must sit above the new role and inside the creator's scope.
 * Interim: new members get the demo password (invite flow replaces this).
 */
export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_users')) {
    return forbidden('Your role cannot add members');
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  if (ROLE_LEVEL[input.role] <= ROLE_LEVEL[ctx.actor.role as Role]) {
    return forbidden('You can only add roles below your own level');
  }
  const manager = await prisma.user.findFirst({
    where: { id: input.managerId, active: true },
  });
  if (
    !manager ||
    ROLE_LEVEL[manager.role as Role] >= ROLE_LEVEL[input.role] ||
    (ctx.actor.role !== 'admin' && !ctx.visible.includes(manager.id))
  ) {
    return forbidden('Manager must be above the new role and in your scope');
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: hashSync('demo123', 10),
      role: input.role,
      managerId: input.managerId,
      region: input.region,
      title: input.title,
    },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'member_added',
      message: `${user.name} added to the workforce`,
      actorId: ctx.actor.id,
      entity: `user:${user.id}`,
    },
  });
  return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
}
