// Domain model for the Sales Force MVP. All data is client-side (mock +
// localStorage) — these types double as the contract for a future API layer.

export type Role = 'admin' | 'regional_manager' | 'team_lead' | 'sales_rep';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Direct superior in the workforce hierarchy. Admin has none. */
  managerId: string | null;
  region: string;
  title: string;
  /** False after deactivation (records handed over, login disabled). */
  active?: boolean;
}

export type LeadSource =
  | 'website'
  | 'social_media'
  | 'email_campaign'
  | 'marketplace'
  | 'walk_in'
  | 'phone'
  | 'field_visit'
  | 'event'
  | 'referral';

export type Channel = 'online' | 'offline';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'disqualified';

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  ownerId: string;
  estimatedValue: number;
  notes: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** True when captured while the device was offline and not yet synced. */
  pendingSync?: boolean;
  /** Campaign this lead is attributed to, if any. */
  campaignId?: string;
  /** Uploaded files: enquiry forms, visiting cards, site photos. */
  attachments?: LeadAttachment[];
}

/** A company being sold to. Contacts and (via them) deals roll up here. */
export interface Account {
  id: string;
  name: string;
  industry: string;
  city: string;
  website: string;
  ownerId: string;
  createdAt: string;
  archived?: boolean;
}

export interface Contact {
  id: string;
  name: string;
  /** Free-text fallback when the contact is not linked to an account. */
  company: string;
  title: string;
  phone: string;
  email: string;
  ownerId: string;
  createdAt: string;
  /** Lead this contact was converted from, if any. */
  leadId?: string;
  /** Linked account (company). */
  accountId?: string;
  archived?: boolean;
}

/** A marketing push (online or offline) that leads are attributed to. */
export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  /** Planned budget — editable by managers. */
  budget: number;
  /** Actual spend to date — editable by managers; ROI uses this when set. */
  spend?: number;
  status: 'active' | 'completed';
  startDate: string; // ISO
  createdAt: string;
}

/** A file attached to a lead (visiting card, filled enquiry form, photo). */
export interface LeadAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Inline preview for small images; larger files keep metadata only. */
  dataUrl?: string;
  uploadedAt: string;
  uploaderId: string;
}

export type DealStage =
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  /** Inactive products stay on old quotes but can't be added to new ones. */
  active?: boolean;
}

/** Company profile — feeds the quotation template and future branding. */
export interface OrgSettings {
  companyName: string;
  addressLine: string;
  gstin: string;
  quoteValidityDays: number;
  gstRate: number; // e.g. 0.18
  quoteTerms: string[];
  /** Sequential quotation counter. */
  quoteCounter: number;
}

/** Editable stage vocabulary + forecast probability (admin → Pipeline). */
export interface StageSetting {
  label: string;
  weight: number;
}

/** A generated quotation — a record, not just a printout. */
export interface Quote {
  id: string;
  dealId: string;
  number: string;
  createdAt: string;
  subtotal: number;
  gst: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted';
  createdById: string;
}

export interface DealLineItem {
  productId: string;
  qty: number;
  /** Unit price at the time the line was added (price-book snapshot). */
  price: number;
}

export interface Deal {
  id: string;
  title: string;
  contactId: string;
  ownerId: string;
  stage: DealStage;
  value: number;
  expectedClose: string; // ISO date
  createdAt: string;
  closedAt?: string;
  lostReason?: string;
  /** When present, deal value is driven by line items. */
  lineItems?: DealLineItem[];
  archived?: boolean;
}

// Sales activities: the rep's daily to-do — calls, meetings, tasks logged
// against a lead, deal or contact, with due dates.
export type SalesActivityKind = 'call' | 'meeting' | 'task' | 'email' | 'note';

export interface SalesActivity {
  id: string;
  kind: SalesActivityKind;
  subject: string;
  notes: string;
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
  /** Who has to do it (the assignee). */
  ownerId: string;
  /**
   * Who logged/assigned it. Differs from ownerId when a manager delegates
   * down the hierarchy. Falls back to ownerId when absent (self-created).
   */
  createdById?: string;
  dueAt?: string; // ISO — absent for plain notes
  completedAt?: string;
  createdAt: string;
  /** Geo check-in captured when the activity was logged (field visits). */
  location?: { lat: number; lng: number };
}

export interface AppNotification {
  id: string;
  /** Recipient. */
  userId: string;
  message: string;
  at: string; // ISO
  read: boolean;
  /** Deep link to the related record. */
  href?: string;
}

export type ActivityType =
  | 'lead_created'
  | 'lead_status'
  | 'lead_converted'
  | 'contact_created'
  | 'account_created'
  | 'campaign_created'
  | 'deal_stage'
  | 'deal_won'
  | 'deal_lost'
  | 'member_added'
  | 'offline_sync';

export interface Activity {
  id: string;
  type: ActivityType;
  message: string;
  userId: string;
  at: string; // ISO
}

export interface AppState {
  users: User[];
  leads: Lead[];
  contacts: Contact[];
  accounts: Account[];
  campaigns: Campaign[];
  deals: Deal[];
  activities: Activity[];
  salesActivities: SalesActivity[];
  products: Product[];
  notifications: AppNotification[];
  quotes: Quote[];
  orgSettings: OrgSettings;
  /** Admin-editable stage labels + forecast weights. */
  stageSettings: Record<DealStage, StageSetting>;
  /** Monthly revenue quota per user id (rolled-up scope for managers). */
  targets: Record<string, number>;
  /** Round-robin pointer for lead auto-assignment. */
  autoAssignCounter: number;
  /** Per-user onboarding checklist dismissal. */
  onboardingDismissed: Record<string, boolean>;
  currentUserId: string | null;
}

// ---------------------------------------------------------------------------
// Display config

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Sales Head',
  regional_manager: 'Regional Manager',
  team_lead: 'Team Lead',
  sales_rep: 'Sales Rep',
};

/** Hierarchy depth per role — lower number = higher authority. */
export const ROLE_LEVEL: Record<Role, number> = {
  admin: 1,
  regional_manager: 2,
  team_lead: 3,
  sales_rep: 4,
};

export const SOURCE_CONFIG: Record<
  LeadSource,
  { label: string; channel: Channel }
> = {
  website: { label: 'Website Form', channel: 'online' },
  social_media: { label: 'Social Media', channel: 'online' },
  email_campaign: { label: 'Email Campaign', channel: 'online' },
  marketplace: { label: 'Marketplace', channel: 'online' },
  walk_in: { label: 'Walk-in', channel: 'offline' },
  phone: { label: 'Phone Enquiry', channel: 'offline' },
  field_visit: { label: 'Field Visit', channel: 'offline' },
  event: { label: 'Event / Expo', channel: 'offline' },
  referral: { label: 'Referral', channel: 'offline' },
};

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  contacted: { label: 'Contacted', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  qualified: { label: 'Qualified', className: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  converted: { label: 'Converted', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  disqualified: { label: 'Disqualified', className: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
};

export const PIPELINE_STAGES: DealStage[] = [
  'qualification',
  'proposal',
  'negotiation',
  'won',
  'lost',
];

/**
 * Stages shown as kanban columns (open pipeline + terminal columns).
 * Internal keys are stable; labels use the sales team's vocabulary:
 * Cold → Warm → Hot → Order Secured / Order Lost.
 */
export const STAGE_CONFIG: Record<
  DealStage,
  { label: string; accent: string }
> = {
  qualification: { label: 'Cold', accent: 'border-t-blue-500' },
  proposal: { label: 'Warm', accent: 'border-t-amber-500' },
  negotiation: { label: 'Hot', accent: 'border-t-orange-500' },
  won: { label: 'Order Secured', accent: 'border-t-emerald-500' },
  lost: { label: 'Order Lost', accent: 'border-t-neutral-400' },
};

/**
 * Forecast probability per open stage — the classic stage-weighted
 * pipeline model (deal value × stage likelihood).
 */
export const STAGE_WEIGHTS: Record<DealStage, number> = {
  qualification: 0.3,
  proposal: 0.5,
  negotiation: 0.75,
  won: 1,
  lost: 0,
};

export const ACTIVITY_KIND_LABELS: Record<SalesActivityKind, string> = {
  call: 'Call',
  meeting: 'Meeting',
  task: 'Task',
  email: 'Email',
  note: 'Note',
};
