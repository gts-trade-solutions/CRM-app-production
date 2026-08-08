// Invite tokens: how a new member gets their first password without anyone
// ever choosing one for them.
//
// The raw token lives only in the email. What is stored is its SHA-256, so a
// database leak yields hashes that cannot be replayed. A plain hash (not
// bcrypt) is right here: the token is 32 bytes of entropy, so there is no
// dictionary to attack, and lookup has to be by exact value.

import { createHash, randomBytes } from 'crypto';
import { prisma } from './db';
import { sendEmail, sesEnabled } from './email';

/** How long an invite stays usable. */
export const INVITE_TTL_HOURS = 72;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function appOrigin(fallback?: string): string {
  return process.env.NEXTAUTH_URL ?? fallback ?? 'http://localhost:3000';
}

/**
 * Issues a fresh invite for a user, replacing any outstanding one — so
 * "resend" also revokes the link that may have gone astray.
 */
export async function issueInvite(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: {
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600_000),
      invitedAt: new Date(),
    },
  });
  return token;
}

export function inviteUrl(token: string, origin?: string): string {
  return `${appOrigin(origin)}/invite/${token}`;
}

/**
 * Resolves an invite token to its user. Returns null for unknown, expired or
 * already-used tokens — the caller must not distinguish between them.
 */
export async function resolveInvite(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const user = await prisma.user.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      inviteExpiresAt: true,
    },
  });
  if (!user || !user.active) return null;
  if (!user.inviteExpiresAt || user.inviteExpiresAt < new Date()) return null;
  return user;
}

export async function sendInviteEmail(
  to: string,
  name: string,
  invitedByName: string,
  token: string,
  origin?: string,
): Promise<{ sent: boolean }> {
  const url = inviteUrl(token, origin);
  const body = [
    `Hi ${name},`,
    '',
    `${invitedByName} has set up your account on the Sales Force CRM.`,
    '',
    'Choose your password here:',
    url,
    '',
    `This link works once and expires in ${INVITE_TTL_HOURS} hours.`,
    'If you were not expecting this, ignore this email — nobody can sign in as you until the link is used.',
  ].join('\n');

  // A failed send must not lose the invite: the caller hands the link to the
  // manager instead, so adding a member never dead-ends on email trouble.
  if (!sesEnabled()) {
    console.info(`[invite] email not configured; link for ${to}: ${url}`);
    return { sent: false };
  }
  try {
    await sendEmail(to, 'Set your Sales Force CRM password', body);
    return { sent: true };
  } catch (err) {
    console.error(`[invite] send failed for ${to}`, err);
    return { sent: false };
  }
}
