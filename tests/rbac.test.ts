// Hierarchy visibility: the data-scope half of authorization.

import { describe, expect, it } from 'vitest';
import {
  assignableUsers,
  creatableRoles,
  managerChain,
  subordinateIds,
  visibleUserIds,
} from '@/lib/rbac';
import { User } from '@/lib/types';

const users: User[] = [
  { id: 'a', name: 'Admin', email: 'a@x', role: 'admin', managerId: null, region: 'N', title: 'Head' },
  { id: 'rm', name: 'RM', email: 'rm@x', role: 'regional_manager', managerId: 'a', region: 'N', title: 'RM' },
  { id: 'tl', name: 'TL', email: 'tl@x', role: 'team_lead', managerId: 'rm', region: 'N', title: 'TL' },
  { id: 'r1', name: 'Rep1', email: 'r1@x', role: 'sales_rep', managerId: 'tl', region: 'N', title: 'Rep' },
  { id: 'r2', name: 'Rep2', email: 'r2@x', role: 'sales_rep', managerId: 'tl', region: 'N', title: 'Rep', active: false },
];

const byId = (id: string) => users.find((u) => u.id === id)!;

describe('subtree visibility', () => {
  it('walks the full management chain downward', () => {
    expect(new Set(subordinateIds(users, 'a'))).toEqual(
      new Set(['rm', 'tl', 'r1', 'r2']),
    );
    expect(new Set(subordinateIds(users, 'tl'))).toEqual(
      new Set(['r1', 'r2']),
    );
    expect(subordinateIds(users, 'r1')).toEqual([]);
  });

  it('a rep sees only themself', () => {
    expect(visibleUserIds(users, byId('r1'))).toEqual(new Set(['r1']));
  });

  it('a team lead sees self + reps; admin sees all', () => {
    expect(visibleUserIds(users, byId('tl'))).toEqual(
      new Set(['tl', 'r1', 'r2']),
    );
    expect(visibleUserIds(users, byId('a')).size).toBe(users.length);
  });
});

describe('assignment & roles', () => {
  it('excludes deactivated users from assignment targets', () => {
    const targets = assignableUsers(users, byId('tl')).map((u) => u.id);
    expect(targets).toContain('r1');
    expect(targets).not.toContain('r2');
  });

  it('creatable roles are strictly below the creator', () => {
    expect(creatableRoles(byId('tl'))).toEqual(['sales_rep']);
    expect(creatableRoles(byId('r1'))).toEqual([]);
    expect(creatableRoles(byId('a'))).toEqual([
      'regional_manager',
      'team_lead',
      'sales_rep',
    ]);
  });

  it('manager chain climbs to the top', () => {
    expect(managerChain(users, byId('r1')).map((u) => u.id)).toEqual([
      'tl',
      'rm',
      'a',
    ]);
  });
});
