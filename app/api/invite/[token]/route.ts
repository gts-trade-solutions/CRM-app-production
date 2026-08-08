// Accepting an invite. Unauthenticated by necessity — the whole point is that
// the invitee has no way in yet. The token is the credential.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashSync } from 'bcryptjs';
import { prisma } from '@/lib/server/db';
import { hashInviteToken, resolveInvite } from '@/lib/server/invites';
import { badRequest, parseBody } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

/** Who the invite is for, so the page can greet them. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const user = await resolveInvite(params.token);
  // Unknown, expired and already-used all answer the same way — the response
  // must not confirm whether an address is registered.
  if (!user) {
    return NextResponse.json(
      { valid: false, message: 'This invite link is invalid or has expired.' },
      { status: 404 },
    );
  }
  return NextResponse.json({
    valid: true,
    name: user.name,
    email: user.email,
  });
}

const acceptSchema = z.object({
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    // Length carries most of the strength; this only rules out the
    // single-character-class cases people reach for first.
    .refine((p) => /[a-z]/i.test(p) && /[0-9]/.test(p), {
      message: 'Include at least one letter and one number',
    }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const user = await resolveInvite(params.token);
  if (!user) return badRequest('This invite link is invalid or has expired.');

  const body = await parseBody(req, acceptSchema);
  if (!body.ok) return body.res;

  // Compare-and-set on the token hash: whichever request gets there first
  // clears it, so a link submitted twice can only take effect once.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, inviteTokenHash: hashInviteToken(params.token) },
    data: {
      passwordHash: hashSync(body.data.password, 10),
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
  if (claimed.count === 0) {
    return badRequest('This invite link is invalid or has expired.');
  }

  await prisma.auditEvent.create({
    data: {
      type: 'invite_accepted',
      message: `${user.name} set their password`,
      actorId: user.id,
      entity: `user:${user.id}`,
    },
  });

  return NextResponse.json({ ok: true, email: user.email });
}
