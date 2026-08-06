// Credential verification against the real users table.
// Assumes `npx prisma db seed` has run (all demo users: demo123).

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { verifyCredentials } from '@/lib/server/auth';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('verifyCredentials', () => {
  it('accepts a seeded user with the demo password', async () => {
    const user = await verifyCredentials('sneha@salesforce.demo', 'demo123');
    expect(user?.id).toBe('u6');
    expect(user?.role).toBe('sales_rep');
  });

  it('is case-insensitive on email', async () => {
    const user = await verifyCredentials('SNEHA@salesforce.demo', 'demo123');
    expect(user?.id).toBe('u6');
  });

  it('rejects a wrong password', async () => {
    expect(
      await verifyCredentials('sneha@salesforce.demo', 'wrong'),
    ).toBeNull();
  });

  it('rejects unknown emails', async () => {
    expect(await verifyCredentials('ghost@nowhere.in', 'demo123')).toBeNull();
  });

  it('rejects deactivated users even with the right password', async () => {
    // Temporarily deactivate, verify rejection, restore.
    await prisma.user.update({
      where: { id: 'u7' },
      data: { active: false },
    });
    try {
      expect(
        await verifyCredentials('amit@salesforce.demo', 'demo123'),
      ).toBeNull();
    } finally {
      await prisma.user.update({
        where: { id: 'u7' },
        data: { active: true },
      });
    }
  });
});
