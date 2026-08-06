// Prisma client singleton — survives Next.js dev-server hot reloads.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Paise (BigInt, DB) → whole rupees (number, wire). */
export function toRupees(p: bigint): number {
  return Number(p) / 100;
}

/** Whole rupees (wire) → paise (BigInt, DB). */
export function toPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}
