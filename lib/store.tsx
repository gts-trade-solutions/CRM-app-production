'use client';

// Client-side data store for the MVP: React context backed by localStorage.
// Seeded from mock data on first run. Replaces a real API layer — every
// mutation here maps 1:1 to a future backend endpoint.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { buildSeedState } from './mock-data';
import { assignableUsers } from './rbac';
import { uid } from './utils';
import {
  Account,
  Activity,
  ActivityType,
  AppState,
  Campaign,
  Channel,
  Contact,
  Deal,
  DealLineItem,
  DealStage,
  Lead,
  LeadAttachment,
  LeadStatus,
  OrgSettings,
  Quote,
  Role,
  SalesActivityKind,
  STAGE_CONFIG,
  StageSetting,
  User,
} from './types';

// v7: policy/admin era — org & stage settings, quote records, user
// lifecycle, archive/reassign. Bumping the key discards stale demo state
// so the enriched seed loads for everyone without a manual reset.
const STORAGE_KEY = 'sf-mvp-state-v7';

/** Merged stage display config: admin-edited labels/weights + accents. */
export type StageConfigMap = Record<
  DealStage,
  { label: string; weight: number; accent: string }
>;

function mergeStages(state: AppState): StageConfigMap {
  const out = {} as StageConfigMap;
  (Object.keys(STAGE_CONFIG) as DealStage[]).forEach((s) => {
    const setting: StageSetting | undefined = state.stageSettings?.[s];
    out[s] = {
      label: setting?.label ?? STAGE_CONFIG[s].label,
      weight: setting?.weight ?? 0,
      accent: STAGE_CONFIG[s].accent,
    };
  });
  return out;
}

/** Sentinel owner value: round-robin auto-assignment across reps in scope. */
export const AUTO_ASSIGN = '__auto';

interface NewLeadInput {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: Lead['source'];
  estimatedValue: number;
  notes: string;
  /** A user id, or AUTO_ASSIGN for round-robin assignment. */
  ownerId: string;
  campaignId?: string;
  attachments?: LeadAttachment[];
}

interface LeadPatch {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  estimatedValue?: number;
  notes?: string;
}

interface CampaignPatch {
  budget?: number;
  spend?: number;
  status?: 'active' | 'completed';
}

interface NewSalesActivityInput {
  kind: SalesActivityKind;
  subject: string;
  notes: string;
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
  dueAt?: string;
  /** Pre-completed at creation (e.g. a sent email being logged). */
  completedAt?: string;
  /** Assignee — defaults to the actor. Managers can delegate down. */
  ownerId?: string;
  /** Geo check-in captured at logging time. */
  location?: { lat: number; lng: number };
}

interface ImportLeadRow {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: Lead['source'];
  estimatedValue: number;
  notes: string;
}

interface NewAccountInput {
  name: string;
  industry: string;
  city: string;
  website: string;
  ownerId: string;
}

interface NewCampaignInput {
  name: string;
  channel: Channel;
  budget: number;
}

interface NewContactInput {
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  ownerId: string;
  accountId?: string;
}

interface NewMemberInput {
  name: string;
  email: string;
  role: Role;
  managerId: string;
  region: string;
  title: string;
}

interface UserPatch {
  name?: string;
  email?: string;
  role?: Role;
  managerId?: string | null;
  region?: string;
  title?: string;
}

interface ContactPatch {
  name?: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  accountId?: string;
}

interface AccountPatch {
  name?: string;
  industry?: string;
  city?: string;
  website?: string;
}

interface ProductInput {
  name: string;
  sku: string;
  category: string;
  price: number;
}

interface StoreValue {
  state: AppState;
  hydrated: boolean;
  online: boolean;
  currentUser: User | null;
  /** Stage labels/weights (admin-editable) merged with column accents. */
  stages: StageConfigMap;
  login: (userId: string) => void;
  logout: () => void;
  resetDemo: () => void;
  addLead: (input: NewLeadInput) => void;
  /** Bulk CSV import. Returns how many rows were added vs skipped as dupes. */
  importLeads: (rows: ImportLeadRow[]) => { added: number; skipped: number };
  updateLead: (leadId: string, patch: LeadPatch) => void;
  addLeadAttachments: (leadId: string, attachments: LeadAttachment[]) => void;
  removeLeadAttachment: (leadId: string, attachmentId: string) => void;
  setLeadStatus: (leadId: string, status: LeadStatus) => void;
  /** Returns the created deal's id (undefined if the lead was not found). */
  convertLead: (
    leadId: string,
    dealTitle: string,
    value: number,
  ) => string | undefined;
  addContact: (input: NewContactInput) => void;
  addDealForContact: (contactId: string, title: string, value: number) => void;
  moveDealStage: (dealId: string, stage: DealStage, lostReason?: string) => void;
  addMember: (input: NewMemberInput) => void;
  addSalesActivity: (input: NewSalesActivityInput) => void;
  toggleActivityComplete: (activityId: string) => void;
  setDealLineItems: (dealId: string, items: DealLineItem[]) => void;
  markNotificationsRead: () => void;
  addAccount: (input: NewAccountInput) => void;
  addCampaign: (input: NewCampaignInput) => void;
  updateCampaign: (campaignId: string, patch: CampaignPatch) => void;
  setDealExpectedClose: (dealId: string, isoDate: string) => void;
  // --- lifecycle / admin ---
  updateContact: (contactId: string, patch: ContactPatch) => void;
  archiveContact: (contactId: string) => void;
  updateAccount: (accountId: string, patch: AccountPatch) => void;
  archiveAccount: (accountId: string) => void;
  updateDealInfo: (dealId: string, patch: { title?: string; value?: number }) => void;
  archiveDeal: (dealId: string) => void;
  reassignLeads: (leadIds: string[], newOwnerId: string) => void;
  updateUser: (userId: string, patch: UserPatch) => void;
  /** Deactivate + hand over open records and direct reports to successor. */
  deactivateUser: (userId: string, successorId: string) => void;
  setTarget: (userId: string, amount: number) => void;
  addProduct: (input: ProductInput) => void;
  updateProduct: (productId: string, patch: Partial<ProductInput> & { active?: boolean }) => void;
  updateOrgSettings: (patch: Partial<OrgSettings>) => void;
  updateStageSetting: (stage: DealStage, setting: StageSetting) => void;
  /** Creates a numbered quote snapshot for a deal; returns its id. */
  createQuote: (dealId: string) => string | undefined;
  setQuoteStatus: (quoteId: string, status: Quote['status']) => void;
  dismissOnboarding: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => buildSeedState());
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Hydrate from localStorage after mount (avoids SSR markup mismatch).
  // Merge over the seed so state saved by an older app version (missing
  // newer fields) can never leave a required collection undefined.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        setState({ ...buildSeedState(), ...parsed });
      }
    } catch {
      // Corrupt storage — fall back to seed.
    }
    setOnline(navigator.onLine);
    setHydrated(true);
  }, []);

  // Persist on every change once hydrated.
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Offline lead capture: when connectivity returns, flush pending leads.
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      const pending = stateRef.current.leads.filter((l) => l.pendingSync);
      if (pending.length === 0) return;
      setState((s) => ({
        ...s,
        leads: s.leads.map((l) =>
          l.pendingSync ? { ...l, pendingSync: false } : l,
        ),
        activities: [
          {
            id: uid('a'),
            type: 'offline_sync' as ActivityType,
            message: `${pending.length} offline lead${pending.length > 1 ? 's' : ''} synced`,
            userId: stateRef.current.currentUserId ?? 'u1',
            at: new Date().toISOString(),
          },
          ...s.activities,
        ],
      }));
      toast.success(
        `Back online — ${pending.length} offline lead${pending.length > 1 ? 's' : ''} synced`,
      );
    }
    function handleOffline() {
      setOnline(false);
      toast.warning('You are offline. New leads will be queued locally.');
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentUser =
    state.users.find((u) => u.id === state.currentUserId) ?? null;

  const pushActivity = useCallback(
    (s: AppState, type: ActivityType, message: string): Activity[] => [
      {
        id: uid('a'),
        type,
        message,
        userId: s.currentUserId ?? 'u1',
        at: new Date().toISOString(),
      },
      ...s.activities,
    ],
    [],
  );

  const login = useCallback((userId: string) => {
    setState((s) => ({ ...s, currentUserId: userId }));
  }, []);

  const logout = useCallback(() => {
    setState((s) => ({ ...s, currentUserId: null }));
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = buildSeedState();
    fresh.currentUserId = stateRef.current.currentUserId;
    setState(fresh);
    toast.success('Demo data reset');
  }, []);

  const addLead = useCallback(
    (input: NewLeadInput) => {
      const isOffline = !navigator.onLine;
      const now = new Date().toISOString();
      let assignedName = '';
      setState((s) => {
        // Round-robin auto-assignment across sales reps in the actor's scope
        // (falls back to the actor when they have no reps).
        let ownerId = input.ownerId;
        let counter = s.autoAssignCounter;
        if (ownerId === AUTO_ASSIGN) {
          const actor = s.users.find((u) => u.id === s.currentUserId);
          const reps = actor
            ? assignableUsers(s.users, actor).filter(
                (u) => u.role === 'sales_rep',
              )
            : [];
          if (reps.length > 0) {
            ownerId = reps[counter % reps.length].id;
            counter += 1;
          } else {
            ownerId = s.currentUserId ?? 'u1';
          }
        }
        const owner = s.users.find((u) => u.id === ownerId);
        assignedName = owner?.name ?? '';
        const lead: Lead = {
          ...input,
          id: uid('l'),
          ownerId,
          status: 'new',
          createdAt: now,
          updatedAt: now,
          ...(isOffline ? { pendingSync: true } : {}),
        };
        const notifications =
          ownerId !== s.currentUserId
            ? [
                {
                  id: uid('n'),
                  userId: ownerId,
                  message: `New lead assigned to you: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
                  at: now,
                  read: false,
                  href: `/leads/${lead.id}`,
                },
                ...s.notifications,
              ]
            : s.notifications;
        return {
          ...s,
          leads: [lead, ...s.leads],
          autoAssignCounter: counter,
          notifications,
          activities: pushActivity(
            s,
            'lead_created',
            `New lead: ${lead.name} (${lead.company || 'no company'})`,
          ),
        };
      });
      if (isOffline) {
        toast.info('Offline — lead saved locally and queued for sync');
      } else if (input.ownerId === AUTO_ASSIGN && assignedName) {
        toast.success(`Lead created — auto-assigned to ${assignedName}`);
      } else {
        toast.success('Lead created');
      }
    },
    [pushActivity],
  );

  const setLeadStatus = useCallback(
    (leadId: string, status: LeadStatus) => {
      setState((s) => {
        const lead = s.leads.find((l) => l.id === leadId);
        if (!lead) return s;
        return {
          ...s,
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, status, updatedAt: new Date().toISOString() }
              : l,
          ),
          activities: pushActivity(
            s,
            'lead_status',
            `${lead.name} marked ${status}`,
          ),
        };
      });
    },
    [pushActivity],
  );

  const convertLead = useCallback(
    (leadId: string, dealTitle: string, value: number) => {
      if (!stateRef.current.leads.some((l) => l.id === leadId)) {
        return undefined;
      }
      const newDealId = uid('d');
      setState((s) => {
        const lead = s.leads.find((l) => l.id === leadId);
        if (!lead) return s;
        const now = new Date().toISOString();
        // Account auto-linking: match the lead's company to an existing
        // account, or create one on the fly (Salesforce-style convert).
        let accounts = s.accounts;
        let accountId: string | undefined;
        if (lead.company.trim()) {
          const existing = s.accounts.find(
            (a) => a.name.toLowerCase() === lead.company.trim().toLowerCase(),
          );
          if (existing) {
            accountId = existing.id;
          } else {
            const account: Account = {
              id: uid('ac'),
              name: lead.company.trim(),
              industry: '',
              city: '',
              website: '',
              ownerId: lead.ownerId,
              createdAt: now,
            };
            accountId = account.id;
            accounts = [account, ...s.accounts];
          }
        }
        const contact: Contact = {
          id: uid('c'),
          name: lead.name,
          company: lead.company,
          title: '',
          phone: lead.phone,
          email: lead.email,
          ownerId: lead.ownerId,
          createdAt: now,
          leadId: lead.id,
          accountId,
        };
        const close = new Date();
        close.setDate(close.getDate() + 30);
        const deal: Deal = {
          id: newDealId,
          title: dealTitle,
          contactId: contact.id,
          ownerId: lead.ownerId,
          stage: 'qualification',
          value,
          expectedClose: close.toISOString(),
          createdAt: now,
        };
        return {
          ...s,
          leads: s.leads.map((l) =>
            l.id === leadId ? { ...l, status: 'converted' as LeadStatus, updatedAt: now } : l,
          ),
          contacts: [contact, ...s.contacts],
          accounts,
          deals: [deal, ...s.deals],
          activities: pushActivity(
            s,
            'lead_converted',
            `${lead.name} converted to contact + deal “${dealTitle}”`,
          ),
        };
      });
      toast.success('Lead converted — account, contact and deal linked');
      return newDealId;
    },
    [pushActivity],
  );

  const importLeads = useCallback(
    (rows: ImportLeadRow[]) => {
      const s = stateRef.current;
      const norm = (p: string) => p.replace(/\D/g, '');
      const knownPhones = new Set(
        [...s.leads, ...s.contacts]
          .map((r) => norm(r.phone))
          .filter((p) => p.length >= 6),
      );
      const knownEmails = new Set(
        [...s.leads, ...s.contacts]
          .map((r) => r.email.trim().toLowerCase())
          .filter(Boolean),
      );
      const now = new Date().toISOString();
      const ownerId = s.currentUserId ?? 'u1';
      const fresh: Lead[] = [];
      let skipped = 0;
      for (const row of rows) {
        const phone = norm(row.phone);
        const email = row.email.trim().toLowerCase();
        const dupe =
          (phone.length >= 6 && knownPhones.has(phone)) ||
          (email !== '' && knownEmails.has(email));
        if (dupe) {
          skipped++;
          continue;
        }
        if (phone.length >= 6) knownPhones.add(phone);
        if (email) knownEmails.add(email);
        fresh.push({
          id: uid('l'),
          name: row.name,
          company: row.company,
          phone: row.phone,
          email: row.email,
          source: row.source,
          status: 'new',
          ownerId,
          estimatedValue: row.estimatedValue,
          notes: row.notes,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (fresh.length > 0) {
        setState((prev) => ({
          ...prev,
          leads: [...fresh, ...prev.leads],
          activities: pushActivity(
            prev,
            'lead_created',
            `${fresh.length} lead${fresh.length > 1 ? 's' : ''} imported from file`,
          ),
        }));
      }
      return { added: fresh.length, skipped };
    },
    [pushActivity],
  );

  const updateLead = useCallback((leadId: string, patch: LeadPatch) => {
    setState((s) => ({
      ...s,
      leads: s.leads.map((l) =>
        l.id === leadId
          ? { ...l, ...patch, updatedAt: new Date().toISOString() }
          : l,
      ),
    }));
    toast.success('Lead updated');
  }, []);

  const addLeadAttachments = useCallback(
    (leadId: string, attachments: LeadAttachment[]) => {
      if (attachments.length === 0) return;
      setState((s) => ({
        ...s,
        leads: s.leads.map((l) =>
          l.id === leadId
            ? {
                ...l,
                attachments: [...(l.attachments ?? []), ...attachments],
                updatedAt: new Date().toISOString(),
              }
            : l,
        ),
      }));
      toast.success(
        `${attachments.length} file${attachments.length > 1 ? 's' : ''} attached`,
      );
    },
    [],
  );

  const removeLeadAttachment = useCallback(
    (leadId: string, attachmentId: string) => {
      setState((s) => ({
        ...s,
        leads: s.leads.map((l) =>
          l.id === leadId
            ? {
                ...l,
                attachments: (l.attachments ?? []).filter(
                  (a) => a.id !== attachmentId,
                ),
              }
            : l,
        ),
      }));
    },
    [],
  );

  const updateCampaign = useCallback(
    (campaignId: string, patch: CampaignPatch) => {
      setState((s) => ({
        ...s,
        campaigns: s.campaigns.map((c) =>
          c.id === campaignId ? { ...c, ...patch } : c,
        ),
      }));
      toast.success('Campaign updated');
    },
    [],
  );

  const setDealExpectedClose = useCallback((dealId: string, isoDate: string) => {
    setState((s) => {
      const deal = s.deals.find((d) => d.id === dealId);
      if (!deal || deal.stage === 'won' || deal.stage === 'lost') return s;
      return {
        ...s,
        deals: s.deals.map((d) =>
          d.id === dealId ? { ...d, expectedClose: isoDate } : d,
        ),
      };
    });
    toast.success('Expected close date updated');
  }, []);

  const addContact = useCallback(
    (input: NewContactInput) => {
      const contact: Contact = {
        id: uid('c'),
        ...input,
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({
        ...s,
        contacts: [contact, ...s.contacts],
        activities: pushActivity(
          s,
          'contact_created',
          `Contact added: ${contact.name} (${contact.company || 'no company'})`,
        ),
      }));
      toast.success('Contact created');
    },
    [pushActivity],
  );

  const addDealForContact = useCallback(
    (contactId: string, title: string, value: number) => {
      setState((s) => {
        const contact = s.contacts.find((c) => c.id === contactId);
        if (!contact) return s;
        const close = new Date();
        close.setDate(close.getDate() + 30);
        const deal: Deal = {
          id: uid('d'),
          title,
          contactId,
          ownerId: contact.ownerId,
          stage: 'qualification',
          value,
          expectedClose: close.toISOString(),
          createdAt: new Date().toISOString(),
        };
        return {
          ...s,
          deals: [deal, ...s.deals],
          activities: pushActivity(s, 'deal_stage', `Deal created: ${title}`),
        };
      });
      toast.success('Deal created');
    },
    [pushActivity],
  );

  const moveDealStage = useCallback(
    (dealId: string, stage: DealStage, lostReason?: string) => {
      setState((s) => {
        const deal = s.deals.find((d) => d.id === dealId);
        if (!deal || deal.stage === stage) return s;
        const now = new Date().toISOString();
        const closed = stage === 'won' || stage === 'lost';
        const type: ActivityType =
          stage === 'won' ? 'deal_won' : stage === 'lost' ? 'deal_lost' : 'deal_stage';
        const actor = s.users.find((u) => u.id === s.currentUserId);
        const owner = s.users.find((u) => u.id === deal.ownerId);
        const notifications = [...s.notifications];
        // Owner is told when someone above them moves their deal.
        const stageLabel =
          s.stageSettings?.[stage]?.label ?? STAGE_CONFIG[stage].label;
        if (owner && owner.id !== s.currentUserId) {
          notifications.unshift({
            id: uid('n'),
            userId: owner.id,
            message: `${actor?.name ?? 'Someone'} moved “${deal.title}” to ${stageLabel}`,
            at: now,
            read: false,
            href: `/pipeline/${deal.id}`,
          });
        }
        // The owner's manager is told about secured orders.
        if (stage === 'won' && owner?.managerId && owner.managerId !== s.currentUserId) {
          notifications.unshift({
            id: uid('n'),
            userId: owner.managerId,
            message: `${owner.name} secured “${deal.title}” at ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(deal.value)}`,
            at: now,
            read: false,
            href: `/pipeline/${deal.id}`,
          });
        }
        return {
          ...s,
          deals: s.deals.map((d) =>
            d.id === dealId
              ? {
                  ...d,
                  stage,
                  closedAt: closed ? now : undefined,
                  lostReason: stage === 'lost' ? lostReason : undefined,
                }
              : d,
          ),
          notifications,
          activities: pushActivity(
            s,
            type,
            `${deal.title} moved to ${STAGE_CONFIG[stage].label}`,
          ),
        };
      });
    },
    [pushActivity],
  );

  const addMember = useCallback(
    (input: NewMemberInput) => {
      const member: User = { id: uid('u'), ...input };
      setState((s) => ({
        ...s,
        users: [...s.users, member],
        activities: pushActivity(
          s,
          'member_added',
          `${member.name} added to the workforce`,
        ),
      }));
      toast.success(`${member.name} added to the team`);
    },
    [pushActivity],
  );

  const addSalesActivity = useCallback(
    (input: NewSalesActivityInput) => {
      let assigneeName = '';
      setState((s) => {
        const actorId = s.currentUserId ?? 'u1';
        const ownerId = input.ownerId ?? actorId;
        const delegated = ownerId !== actorId;
        if (delegated) {
          assigneeName =
            s.users.find((u) => u.id === ownerId)?.name ?? '';
        }
        const actor = s.users.find((u) => u.id === actorId);
        return {
          ...s,
          salesActivities: [
            {
              ...input,
              id: uid('sa'),
              ownerId,
              createdById: actorId,
              createdAt: new Date().toISOString(),
            },
            ...s.salesActivities,
          ],
          // The assignee is told when work lands on their plate.
          notifications: delegated
            ? [
                {
                  id: uid('n'),
                  userId: ownerId,
                  message: `${actor?.name ?? 'Someone'} assigned you: ${input.subject}`,
                  at: new Date().toISOString(),
                  read: false,
                  href: '/activities',
                },
                ...s.notifications,
              ]
            : s.notifications,
        };
      });
      if (assigneeName) {
        toast.success(`Assigned to ${assigneeName}`);
      } else {
        toast.success(
          input.kind === 'note' ? 'Note added' : 'Activity scheduled',
        );
      }
    },
    [],
  );

  const toggleActivityComplete = useCallback((activityId: string) => {
    setState((s) => ({
      ...s,
      salesActivities: s.salesActivities.map((a) =>
        a.id === activityId
          ? {
              ...a,
              completedAt: a.completedAt
                ? undefined
                : new Date().toISOString(),
            }
          : a,
      ),
    }));
  }, []);

  const setDealLineItems = useCallback((dealId: string, items: DealLineItem[]) => {
    setState((s) => {
      const deal = s.deals.find((d) => d.id === dealId);
      if (!deal || deal.stage === 'won' || deal.stage === 'lost') return s;
      const value = items.reduce((sum, it) => sum + it.qty * it.price, 0);
      return {
        ...s,
        deals: s.deals.map((d) =>
          d.id === dealId
            ? { ...d, lineItems: items, value: items.length ? value : d.value }
            : d,
        ),
      };
    });
  }, []);

  const addAccount = useCallback(
    (input: NewAccountInput) => {
      const account: Account = {
        ...input,
        id: uid('ac'),
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({
        ...s,
        accounts: [account, ...s.accounts],
        activities: pushActivity(
          s,
          'account_created',
          `Account added: ${account.name}`,
        ),
      }));
      toast.success('Account created');
    },
    [pushActivity],
  );

  const addCampaign = useCallback(
    (input: NewCampaignInput) => {
      const campaign: Campaign = {
        ...input,
        id: uid('cam'),
        status: 'active',
        startDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({
        ...s,
        campaigns: [campaign, ...s.campaigns],
        activities: pushActivity(
          s,
          'campaign_created',
          `Campaign launched: ${campaign.name}`,
        ),
      }));
      toast.success('Campaign created');
    },
    [pushActivity],
  );

  const markNotificationsRead = useCallback(() => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) =>
        n.userId === s.currentUserId && !n.read ? { ...n, read: true } : n,
      ),
    }));
  }, []);

  const updateContact = useCallback((contactId: string, patch: ContactPatch) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) =>
        c.id === contactId ? { ...c, ...patch } : c,
      ),
    }));
    toast.success('Contact updated');
  }, []);

  const archiveContact = useCallback((contactId: string) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) =>
        c.id === contactId ? { ...c, archived: true } : c,
      ),
    }));
    toast.success('Contact archived');
  }, []);

  const updateAccount = useCallback((accountId: string, patch: AccountPatch) => {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) =>
        a.id === accountId ? { ...a, ...patch } : a,
      ),
    }));
    toast.success('Account updated');
  }, []);

  const archiveAccount = useCallback((accountId: string) => {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) =>
        a.id === accountId ? { ...a, archived: true } : a,
      ),
    }));
    toast.success('Account archived');
  }, []);

  const updateDealInfo = useCallback(
    (dealId: string, patch: { title?: string; value?: number }) => {
      setState((s) => {
        const deal = s.deals.find((d) => d.id === dealId);
        if (!deal || deal.stage === 'won' || deal.stage === 'lost') return s;
        // Line items own the value once present.
        const value =
          deal.lineItems?.length ? deal.value : (patch.value ?? deal.value);
        return {
          ...s,
          deals: s.deals.map((d) =>
            d.id === dealId
              ? { ...d, title: patch.title ?? d.title, value }
              : d,
          ),
        };
      });
      toast.success('Deal updated');
    },
    [],
  );

  const archiveDeal = useCallback((dealId: string) => {
    setState((s) => ({
      ...s,
      deals: s.deals.map((d) =>
        d.id === dealId ? { ...d, archived: true } : d,
      ),
    }));
    toast.success('Deal archived');
  }, []);

  const reassignLeads = useCallback(
    (leadIds: string[], newOwnerId: string) => {
      if (leadIds.length === 0) return;
      const now = new Date().toISOString();
      setState((s) => {
        const owner = s.users.find((u) => u.id === newOwnerId);
        const ids = new Set(leadIds);
        const notifications =
          newOwnerId !== s.currentUserId
            ? [
                {
                  id: uid('n'),
                  userId: newOwnerId,
                  message: `${ids.size} lead${ids.size > 1 ? 's' : ''} reassigned to you`,
                  at: now,
                  read: false,
                  href: '/leads',
                },
                ...s.notifications,
              ]
            : s.notifications;
        return {
          ...s,
          leads: s.leads.map((l) =>
            ids.has(l.id) ? { ...l, ownerId: newOwnerId, updatedAt: now } : l,
          ),
          notifications,
          activities: pushActivity(
            s,
            'lead_status',
            `${ids.size} lead${ids.size > 1 ? 's' : ''} reassigned to ${owner?.name ?? 'member'}`,
          ),
        };
      });
      toast.success('Leads reassigned');
    },
    [pushActivity],
  );

  const updateUser = useCallback((userId: string, patch: UserPatch) => {
    setState((s) => ({
      ...s,
      users: s.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
    }));
    toast.success('Member updated');
  }, []);

  const deactivateUser = useCallback(
    (userId: string, successorId: string) => {
      setState((s) => {
        const user = s.users.find((u) => u.id === userId);
        const successor = s.users.find((u) => u.id === successorId);
        if (!user || !successor || userId === successorId) return s;
        const now = new Date().toISOString();
        const openLead = (l: Lead) =>
          l.ownerId === userId &&
          l.status !== 'converted' &&
          l.status !== 'disqualified';
        const openDeal = (d: Deal) =>
          d.ownerId === userId && d.stage !== 'won' && d.stage !== 'lost';
        return {
          ...s,
          users: s.users.map((u) => {
            if (u.id === userId) return { ...u, active: false };
            // Direct reports move up to the successor.
            if (u.managerId === userId) return { ...u, managerId: successorId };
            return u;
          }),
          leads: s.leads.map((l) =>
            openLead(l) ? { ...l, ownerId: successorId, updatedAt: now } : l,
          ),
          contacts: s.contacts.map((c) =>
            c.ownerId === userId ? { ...c, ownerId: successorId } : c,
          ),
          accounts: s.accounts.map((a) =>
            a.ownerId === userId ? { ...a, ownerId: successorId } : a,
          ),
          deals: s.deals.map((d) =>
            openDeal(d) ? { ...d, ownerId: successorId } : d,
          ),
          salesActivities: s.salesActivities.map((a) =>
            a.ownerId === userId && !a.completedAt
              ? { ...a, ownerId: successorId }
              : a,
          ),
          notifications: [
            {
              id: uid('n'),
              userId: successorId,
              message: `${user.name}'s open records were handed over to you`,
              at: now,
              read: false,
              href: '/leads',
            },
            ...s.notifications,
          ],
          activities: pushActivity(
            s,
            'member_added',
            `${user.name} deactivated — open records handed to ${successor.name}`,
          ),
        };
      });
      toast.success('Member deactivated and records handed over');
    },
    [pushActivity],
  );

  const setTarget = useCallback((userId: string, amount: number) => {
    setState((s) => ({
      ...s,
      targets: { ...s.targets, [userId]: amount },
    }));
    toast.success('Target updated');
  }, []);

  const addProduct = useCallback((input: ProductInput) => {
    setState((s) => ({
      ...s,
      products: [...s.products, { ...input, id: uid('p'), active: true }],
    }));
    toast.success('Product added');
  }, []);

  const updateProduct = useCallback(
    (productId: string, patch: Partial<ProductInput> & { active?: boolean }) => {
      setState((s) => ({
        ...s,
        products: s.products.map((p) =>
          p.id === productId ? { ...p, ...patch } : p,
        ),
      }));
      toast.success('Product updated');
    },
    [],
  );

  const updateOrgSettings = useCallback((patch: Partial<OrgSettings>) => {
    setState((s) => ({
      ...s,
      orgSettings: { ...s.orgSettings, ...patch },
    }));
    toast.success('Organisation settings saved');
  }, []);

  const updateStageSetting = useCallback(
    (stage: DealStage, setting: StageSetting) => {
      setState((s) => ({
        ...s,
        stageSettings: { ...s.stageSettings, [stage]: setting },
      }));
      toast.success('Pipeline settings saved');
    },
    [],
  );

  const createQuote = useCallback((dealId: string) => {
    const s = stateRef.current;
    const deal = s.deals.find((d) => d.id === dealId);
    if (!deal || !deal.lineItems?.length) return undefined;
    const subtotal = deal.lineItems.reduce(
      (sum, it) => sum + it.qty * it.price,
      0,
    );
    const gst = Math.round(subtotal * (s.orgSettings.gstRate ?? 0.18));
    const now = new Date();
    const counter = s.orgSettings.quoteCounter ?? 1;
    const quote: Quote = {
      id: uid('q'),
      dealId,
      number: `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(counter).padStart(4, '0')}`,
      createdAt: now.toISOString(),
      subtotal,
      gst,
      total: subtotal + gst,
      status: 'draft',
      createdById: s.currentUserId ?? 'u1',
    };
    setState((prev) => ({
      ...prev,
      quotes: [quote, ...prev.quotes],
      orgSettings: { ...prev.orgSettings, quoteCounter: counter + 1 },
    }));
    return quote.id;
  }, []);

  const setQuoteStatus = useCallback(
    (quoteId: string, status: Quote['status']) => {
      setState((s) => ({
        ...s,
        quotes: s.quotes.map((q) => (q.id === quoteId ? { ...q, status } : q)),
      }));
    },
    [],
  );

  const dismissOnboarding = useCallback(() => {
    setState((s) =>
      s.currentUserId
        ? {
            ...s,
            onboardingDismissed: {
              ...s.onboardingDismissed,
              [s.currentUserId]: true,
            },
          }
        : s,
    );
  }, []);

  const stages = mergeStages(state);

  const value: StoreValue = {
    state,
    hydrated,
    online,
    currentUser,
    stages,
    login,
    logout,
    resetDemo,
    addLead,
    importLeads,
    updateLead,
    addLeadAttachments,
    removeLeadAttachment,
    setLeadStatus,
    convertLead,
    addContact,
    addDealForContact,
    moveDealStage,
    addMember,
    addSalesActivity,
    toggleActivityComplete,
    setDealLineItems,
    markNotificationsRead,
    addAccount,
    addCampaign,
    updateCampaign,
    setDealExpectedClose,
    updateContact,
    archiveContact,
    updateAccount,
    archiveAccount,
    updateDealInfo,
    archiveDeal,
    reassignLeads,
    updateUser,
    deactivateUser,
    setTarget,
    addProduct,
    updateProduct,
    updateOrgSettings,
    updateStageSetting,
    createQuote,
    setQuoteStatus,
    dismissOnboarding,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
