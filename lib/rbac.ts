// Hierarchy-based access control. Visibility flows down the management
// chain: every user sees their own records plus those of everyone below
// them in the org tree (direct and indirect reports).

import { Role, ROLE_LEVEL, User } from './types';

/** IDs of all direct + indirect reports of `userId`. */
export function subordinateIds(users: User[], userId: string): string[] {
  const byManager = new Map<string, User[]>();
  for (const u of users) {
    if (!u.managerId) continue;
    const list = byManager.get(u.managerId) ?? [];
    list.push(u);
    byManager.set(u.managerId, list);
  }
  const result: string[] = [];
  const queue = [userId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const report of byManager.get(current) ?? []) {
      result.push(report.id);
      queue.push(report.id);
    }
  }
  return result;
}

/** The set of user IDs whose records `user` is allowed to see. */
export function visibleUserIds(users: User[], user: User): Set<string> {
  if (user.role === 'admin') return new Set(users.map((u) => u.id));
  return new Set([user.id, ...subordinateIds(users, user.id)]);
}

/** Users `user` can assign records to (self + active subordinates). */
export function assignableUsers(users: User[], user: User): User[] {
  const visible = visibleUserIds(users, user);
  return users.filter((u) => visible.has(u.id) && u.active !== false);
}

/** Whether `user` may add workforce members (anyone above rep level). */
export function canManageWorkforce(user: User): boolean {
  return user.role !== 'sales_rep';
}

/** Roles `manager` may create underneath them (strictly lower levels). */
export function creatableRoles(manager: User): Role[] {
  const level = ROLE_LEVEL[manager.role];
  return (Object.keys(ROLE_LEVEL) as Role[]).filter(
    (r) => ROLE_LEVEL[r] > level,
  );
}

/** Chain of managers from `user` up to the top (nearest first). */
export function managerChain(users: User[], user: User): User[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const chain: User[] = [];
  let current = user.managerId ? byId.get(user.managerId) : undefined;
  while (current) {
    chain.push(current);
    current = current.managerId ? byId.get(current.managerId) : undefined;
  }
  return chain;
}
