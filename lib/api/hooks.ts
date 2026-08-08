'use client';

// React Query hooks over the app's API — the data layer that replaces the
// localStorage store page by page. Wire types mirror the API serializers.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './client';
import type { LeadSource, LeadStatus, Role } from '@/lib/types';
import {
  CreateLeadInput,
  enqueueOfflineLead,
  flushOutbox,
  outboxCount,
} from './outbox';

export type { CreateLeadInput };

/* ---------------------------------------------------------------- types */

export interface WireUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId: string | null;
  region: string;
  title: string;
  active: boolean;
}

export interface WireLead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  ownerId: string;
  owner?: { id: string; name: string };
  estimatedValue: number;
  notes: string;
  campaignId: string | null;
  pendingSync: boolean;
  createdAt: string;
  updatedAt: string;
  activityCount?: number;
  attachmentCount?: number;
  contactId?: string | null;
  convertedDealId?: string | null;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    dataUrl: string | null;
    /** Presigned S3 URL (or inline data-URL fallback) for preview/download. */
    url: string | null;
    uploadedAt: string;
  }>;
}

export interface WireActivity {
  id: string;
  kind: 'call' | 'meeting' | 'task' | 'email' | 'note';
  subject: string;
  notes: string;
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
  ownerId: string;
  owner?: { id: string; name: string };
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  dueAt: string | null;
  completedAt: string | null;
  location: { lat: number; lng: number } | null;
  createdAt: string;
  relatedName?: string;
  relatedHref?: string;
  /** Empty for a single-record activity; one entry per record otherwise. */
  targets: WireActivityTarget[];
  targetsTotal: number;
  targetsDone: number;
}

export interface WireActivityTarget {
  id: string;
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
  completedAt: string | null;
  name: string;
  href: string;
}

export interface WireCampaign {
  id: string;
  name: string;
  channel: string;
  budget: number;
  spend: number | null;
  status: 'active' | 'completed';
  startDate: string;
}

/* ----------------------------------------------------------------- me */

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: WireUser }>('/api/me').then((r) => r.user),
    staleTime: 5 * 60_000,
  });
}

export function useApiUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: WireUser[] }>('/api/users').then((r) => r.users),
    staleTime: 60_000,
  });
}

export function useApiCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () =>
      api<{ campaigns: WireCampaign[] }>('/api/campaigns').then(
        (r) => r.campaigns,
      ),
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------------- leads */

export interface LeadFilters {
  page: number;
  status?: string;
  channel?: string;
  q?: string;
  ownerId?: string;
  campaignId?: string;
  /** Server caps this at 100; pickers ask for more than the list does. */
  pageSize?: number;
}

export function useLeads(filters: LeadFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.status && filters.status !== 'all')
    params.set('status', filters.status);
  if (filters.channel && filters.channel !== 'all')
    params.set('channel', filters.channel);
  if (filters.q) params.set('q', filters.q);
  if (filters.ownerId && filters.ownerId !== 'all')
    params.set('ownerId', filters.ownerId);
  if (filters.campaignId) params.set('campaignId', filters.campaignId);

  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () =>
      api<{ page: number; pageSize: number; total: number; leads: WireLead[] }>(
        `/api/leads?${params.toString()}`,
      ),
    placeholderData: (prev) => prev,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api<{ lead: WireLead }>(`/api/leads/${id}`).then((r) => r.lead),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLeadInput) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Offline: durable local queue, idempotent replay on reconnect.
        enqueueOfflineLead(input);
        return { queued: true as const };
      }
      return api<{ id: string; ownerId: string }>('/api/leads', {
        method: 'POST',
        json: input,
      });
    },
    onSuccess: (result) => {
      if ('queued' in result) {
        toast.info('Offline — lead queued locally and will sync on reconnect');
      } else {
        toast.success('Lead created');
      }
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<{ lead: WireLead }>(`/api/leads/${id}`, {
        method: 'PATCH',
        json: patch,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      leadId,
      dealTitle,
      value,
    }: {
      leadId: string;
      dealTitle: string;
      value: number;
    }) =>
      api<{ dealId: string }>(`/api/leads/${leadId}/convert`, {
        method: 'POST',
        json: { dealTitle, value },
      }),
    onSuccess: () => {
      toast.success('Lead converted — account, contact and deal linked');
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReassignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadIds: string[]; newOwnerId: string }) =>
      api<{ reassigned: number }>('/api/leads/reassign', {
        method: 'POST',
        json: input,
      }),
    onSuccess: (r) => {
      toast.success(`${r.reassigned} lead${r.reassigned === 1 ? '' : 's'} reassigned`);
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: unknown[]) =>
      api<{ added: number; skipped: number }>('/api/leads/import', {
        method: 'POST',
        json: { rows },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/* --------------------------------------------------------- activities */

export function useActivities(params: {
  scope?: 'mine' | 'team';
  relatedType?: string;
  relatedId?: string;
}) {
  const sp = new URLSearchParams();
  if (params.scope) sp.set('scope', params.scope);
  if (params.relatedType && params.relatedId) {
    sp.set('relatedType', params.relatedType);
    sp.set('relatedId', params.relatedId);
  }
  return useQuery({
    queryKey: ['activities', params],
    queryFn: () =>
      api<{ activities: WireActivity[] }>(`/api/activities?${sp.toString()}`).then(
        (r) => r.activities,
      ),
  });
}

export interface CreateActivityInput {
  kind: WireActivity['kind'];
  subject: string;
  notes: string;
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
  ownerId?: string;
  dueAt?: string;
  completedAt?: string;
  location?: { lat: number; lng: number };
  /** Several records under one task — "call these five leads". */
  targets?: Array<{ relatedType: 'lead' | 'deal' | 'contact'; relatedId: string }>;
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActivityInput) =>
      api<{ id: string }>('/api/activities', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      completed,
      targetId,
    }: {
      id: string;
      completed: boolean;
      /** Tick one record of a multi-record task instead of the whole task. */
      targetId?: string;
    }) =>
      api(`/api/activities/${id}`, {
        method: 'PATCH',
        json: { completed, targetId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ----------------------------------------------------------- calendar */

export interface CalendarSubscription {
  url: string;
  webcalUrl: string;
}

export function useCalendarSubscription() {
  return useQuery({
    queryKey: ['calendar-subscription'],
    queryFn: () => api<CalendarSubscription>('/api/calendar/subscription'),
    staleTime: 5 * 60_000,
  });
}

export function useRotateCalendarLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CalendarSubscription>('/api/calendar/subscription', {
        method: 'POST',
      }),
    onSuccess: (data) => {
      qc.setQueryData(['calendar-subscription'], data);
      toast.success('New link created — re-subscribe on your devices');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------- outbox */

/** Flush queued offline leads; call from an 'online' listener. */
export function useOutboxFlusher() {
  const qc = useQueryClient();
  return async () => {
    const flushed = await flushOutbox();
    if (flushed > 0) {
      toast.success(
        `Back online — ${flushed} offline lead${flushed > 1 ? 's' : ''} synced`,
      );
      qc.invalidateQueries({ queryKey: ['leads'] });
    }
    return flushed;
  };
}

export { outboxCount };
