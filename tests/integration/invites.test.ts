// Invite guarantees against the real database: an invited member cannot sign
// in until they set a password, the raw token is never stored, a link works
// once, and expiry is enforced.

import { afterAll, describe, expect, it } from 'vitest';
import { hashSync } from 'bcryptjs';
import { prisma } from '@/lib/server/db';
import { verifyCredentials } from '@/lib/server/auth';
import {
  hashInviteToken,
  issueInvite,
  resolveInvite,
} from '@/lib/server/invites';

const created: string[] = [];

async function makeInvitedUser() {
  const manager = await prisma.user.findFirstOrThrow({
    where: { role: 'team_lead', active: true },
  });
  const user = await prisma.user.create({
    data: {
      name: `IT Invitee ${Date.now()}-${Math.random()}`,
      email: `it-invite-${Date.now()}-${Math.random()}@example.test`,
      passwordHash: null,
      role: 'sales_rep',
      managerId: manager.id,
      region: 'North',
      title: 'Sales Rep',
    },
  });
  created.push(user.id);
  return user;
}

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { actorId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('invites', () => {
  it('a member without a password cannot sign in, whatever is guessed', async () => {
    const user = await makeInvitedUser();
    expect(await verifyCredentials(user.email, 'demo123')).toBeNull();
    expect(await verifyCredentials(user.email, '')).toBeNull();
    expect(await verifyCredentials(user.email, 'anything')).toBeNull();
  });

  it('stores only the hash of the token, never the token', async () => {
    const user = await makeInvitedUser();
    const token = await issueInvite(user.id);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { inviteTokenHash: true },
    });
    expect(row.inviteTokenHash).not.toBe(token);
    expect(row.inviteTokenHash).toBe(hashInviteToken(token));
    // A dump of the column must not contain anything usable as a link.
    expect(row.inviteTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves a fresh token and rejects a wrong one', async () => {
    const user = await makeInvitedUser();
    const token = await issueInvite(user.id);
    const resolved = await resolveInvite(token);
    expect(resolved?.id).toBe(user.id);
    expect(await resolveInvite('f'.repeat(64))).toBeNull();
    expect(await resolveInvite('not-a-token')).toBeNull();
  });

  it('re-issuing revokes the previous link', async () => {
    const user = await makeInvitedUser();
    const first = await issueInvite(user.id);
    const second = await issueInvite(user.id);
    expect(await resolveInvite(first)).toBeNull();
    expect((await resolveInvite(second))?.id).toBe(user.id);
  });

  it('rejects an expired token', async () => {
    const user = await makeInvitedUser();
    const token = await issueInvite(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolveInvite(token)).toBeNull();
  });

  it('a claimed invite cannot be replayed', async () => {
    const user = await makeInvitedUser();
    const token = await issueInvite(user.id);

    // What the accept route does: compare-and-set on the stored hash.
    const claim = () =>
      prisma.user.updateMany({
        where: { id: user.id, inviteTokenHash: hashInviteToken(token) },
        data: {
          passwordHash: hashSync('a-strong-password-1', 10),
          inviteTokenHash: null,
          inviteExpiresAt: null,
        },
      });
    expect((await claim()).count).toBe(1);
    expect((await claim()).count).toBe(0);
    expect(await resolveInvite(token)).toBeNull();
  });

  it('once accepted, the password works', async () => {
    const user = await makeInvitedUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashSync('a-strong-password-1', 10) },
    });
    const ok = await verifyCredentials(user.email, 'a-strong-password-1');
    expect(ok?.id).toBe(user.id);
    expect(await verifyCredentials(user.email, 'wrong-password-9')).toBeNull();
  });

  it('a deactivated member with a live invite cannot resolve it', async () => {
    const user = await makeInvitedUser();
    const token = await issueInvite(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { active: false },
    });
    expect(await resolveInvite(token)).toBeNull();
  });
});
