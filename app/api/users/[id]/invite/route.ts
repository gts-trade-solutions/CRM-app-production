// Resend an invite. Issuing a new token revokes the previous one, so this is
// also the way to cut off a link that went to the wrong place.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import { inviteUrl, issueInvite, sendInviteEmail } from '@/lib/server/invites';
import {
  actorContext,
  badRequest,
  forbidden,
  notFound,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_users')) {
    return forbidden('Your role cannot invite members');
  }
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user || !ctx.visible.includes(user.id)) return notFound();
  if (!user.active) return badRequest('That member is deactivated');
  // Re-inviting someone who already has a password would let a manager
  // silently take over a colleague's account.
  if (user.passwordHash) {
    return badRequest('That member has already set a password');
  }

  const token = await issueInvite(user.id);
  const origin = new URL(req.url).origin;
  const { sent } = await sendInviteEmail(
    user.email,
    user.name,
    ctx.actor.name,
    token,
    origin,
  );
  await prisma.auditEvent.create({
    data: {
      type: 'member_invited',
      message: `Invite re-sent to ${user.name}`,
      actorId: ctx.actor.id,
      entity: `user:${user.id}`,
    },
  });

  return NextResponse.json({
    inviteSent: sent,
    inviteUrl: sent ? null : inviteUrl(token, origin),
  });
}
