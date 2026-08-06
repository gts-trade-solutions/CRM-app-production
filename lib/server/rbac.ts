// Server-side RBAC: the authoritative twin of lib/rbac.ts. Visibility is
// the actor's subtree of the management hierarchy, computed from the users
// table. At current scale a BFS over all users is fast and correct; the
// M5 load test decides whether to switch to a materialized-path column.

import { prisma } from './db';

export async function visibleUserIdsFor(userId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    select: { id: true, managerId: true, role: true },
  });
  const me = users.find((u) => u.id === userId);
  if (!me) return [];
  if (me.role === 'admin') return users.map((u) => u.id);

  const byManager = new Map<string, string[]>();
  for (const u of users) {
    if (!u.managerId) continue;
    const list = byManager.get(u.managerId) ?? [];
    list.push(u.id);
    byManager.set(u.managerId, list);
  }
  const result = [userId];
  const queue = [userId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const report of byManager.get(current) ?? []) {
      result.push(report);
      queue.push(report);
    }
  }
  return result;
}
