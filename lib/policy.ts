// The authorization policy: one role × capability matrix that the UI reads
// for rendering (nav, guards, buttons) and the future API reads for
// enforcement. Data-scope visibility (who owns what) stays in rbac.ts;
// this file answers "may this role perform this action at all?".

import { Role } from './types';

export type Capability =
  | 'view_admin'
  | 'view_team'
  | 'view_reports'
  | 'view_campaigns'
  | 'manage_users'
  | 'set_targets'
  | 'manage_products'
  | 'manage_org'
  | 'manage_pipeline'
  | 'manage_campaigns'
  | 'reassign_records'
  | 'archive_records'
  | 'assign_activities'
  | 'export_csv';

const MATRIX: Record<Role, Capability[]> = {
  admin: [
    'view_admin',
    'view_team',
    'view_reports',
    'view_campaigns',
    'manage_users',
    'set_targets',
    'manage_products',
    'manage_org',
    'manage_pipeline',
    'manage_campaigns',
    'reassign_records',
    'archive_records',
    'assign_activities',
    'export_csv',
  ],
  regional_manager: [
    'view_team',
    'view_reports',
    'view_campaigns',
    'manage_users',
    'manage_campaigns',
    'reassign_records',
    'archive_records',
    'assign_activities',
    'export_csv',
  ],
  team_lead: [
    'view_team',
    'view_reports',
    'view_campaigns',
    'manage_users',
    'manage_campaigns',
    'reassign_records',
    'archive_records',
    'assign_activities',
    'export_csv',
  ],
  sales_rep: ['view_reports', 'view_campaigns', 'export_csv'],
};

export function hasCapability(
  role: Role | undefined | null,
  capability: Capability,
): boolean {
  if (!role) return false;
  return MATRIX[role].includes(capability);
}

/** Where each role lands after login — their job-to-be-done page. */
export function postLoginRoute(role: Role): string {
  return role === 'sales_rep' ? '/activities' : '/dashboard';
}
