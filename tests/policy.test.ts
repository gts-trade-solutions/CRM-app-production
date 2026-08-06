// The policy matrix is the single authorization source — these tests
// encode the intended access model so regressions are loud.

import { describe, expect, it } from 'vitest';
import { hasCapability, postLoginRoute } from '@/lib/policy';

describe('capability matrix', () => {
  it('only admin can access the admin console', () => {
    expect(hasCapability('admin', 'view_admin')).toBe(true);
    expect(hasCapability('regional_manager', 'view_admin')).toBe(false);
    expect(hasCapability('team_lead', 'view_admin')).toBe(false);
    expect(hasCapability('sales_rep', 'view_admin')).toBe(false);
  });

  it('reps cannot see the team page or manage anything', () => {
    expect(hasCapability('sales_rep', 'view_team')).toBe(false);
    expect(hasCapability('sales_rep', 'manage_users')).toBe(false);
    expect(hasCapability('sales_rep', 'reassign_records')).toBe(false);
    expect(hasCapability('sales_rep', 'archive_records')).toBe(false);
    expect(hasCapability('sales_rep', 'assign_activities')).toBe(false);
  });

  it('managers can manage their teams but not org settings', () => {
    for (const role of ['team_lead', 'regional_manager'] as const) {
      expect(hasCapability(role, 'view_team')).toBe(true);
      expect(hasCapability(role, 'manage_users')).toBe(true);
      expect(hasCapability(role, 'reassign_records')).toBe(true);
      expect(hasCapability(role, 'manage_org')).toBe(false);
      expect(hasCapability(role, 'manage_products')).toBe(false);
      expect(hasCapability(role, 'set_targets')).toBe(false);
    }
  });

  it('everyone can view reports and export their scope', () => {
    for (const role of [
      'admin',
      'regional_manager',
      'team_lead',
      'sales_rep',
    ] as const) {
      expect(hasCapability(role, 'view_reports')).toBe(true);
      expect(hasCapability(role, 'export_csv')).toBe(true);
    }
  });

  it('handles missing role safely', () => {
    expect(hasCapability(undefined, 'view_admin')).toBe(false);
    expect(hasCapability(null, 'view_reports')).toBe(false);
  });
});

describe('post-login routing', () => {
  it('reps land on My Day; managers on the dashboard', () => {
    expect(postLoginRoute('sales_rep')).toBe('/activities');
    expect(postLoginRoute('team_lead')).toBe('/dashboard');
    expect(postLoginRoute('regional_manager')).toBe('/dashboard');
    expect(postLoginRoute('admin')).toBe('/dashboard');
  });
});
