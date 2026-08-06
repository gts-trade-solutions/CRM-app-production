'use client';

// React Query hooks for contacts, accounts, deals, quotes, settings,
// notifications, products and global search.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './client';
import { DealStage, STAGE_CONFIG } from '@/lib/types';

/* ---------------------------------------------------------------- types */

export interface WireContact {
  id: string;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  ownerId: string;
  owner?: { id: string; name: string };
  leadId: string | null;
  accountId: string | null;
  account: { id: string; name: string } | null;
  archived: boolean;
  createdAt: string;
}

export interface WireAccount {
  id: string;
  name: string;
  industry: string;
  city: string;
  website: string;
  ownerId: string;
  owner?: { id: string; name: string };
  archived: boolean;
  createdAt: string;
  contactCount?: number;
  openValue?: number;
  securedValue?: number;
}

export interface WireDeal {
  id: string;
  title: string;
  contactId: string;
  contact?: { id: string; name: string; accountId?: string | null };
  ownerId: string;
  owner?: { id: string; name: string };
  stage: DealStage;
  value: number;
  expectedClose: string;
  closedAt: string | null;
  lostReason: string | null;
  archived: boolean;
  createdAt: string;
  lineItems?: Array<{
    productId: string;
    productName?: string;
    sku?: string;
    qty: number;
    price: number;
  }>;
}

export interface WireQuote {
  id: string;
  dealId: string;
  number: string;
  subtotal: number;
  gst: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted';
  createdAt: string;
}

export interface WireProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  active: boolean;
}

export interface WireNotification {
  id: string;
  message: string;
  href: string | null;
  read: boolean;
  at: string;
}

export interface OrgSettingsWire {
  companyName: string;
  addressLine: string;
  gstin: string;
  quoteValidityDays: number;
  gstRate: number;
  quoteTerms: string[];
}

export type StageConfigMap = Record<
  DealStage,
  { label: string; weight: number; accent: string }
>;

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/* ------------------------------------------------------------- settings */

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      api<{
        org: OrgSettingsWire | null;
        stages: Record<string, { label: string; weight: number }>;
      }>('/api/settings'),
    staleTime: 5 * 60_000,
  });
}

/** Stage labels/weights from the DB merged with the static column accents. */
export function useStageConfig(): StageConfigMap {
  const { data } = useSettings();
  const out = {} as StageConfigMap;
  (Object.keys(STAGE_CONFIG) as DealStage[]).forEach((s) => {
    const setting = data?.stages?.[s];
    out[s] = {
      label: setting?.label ?? STAGE_CONFIG[s].label,
      weight: setting?.weight ?? 0,
      accent: STAGE_CONFIG[s].accent,
    };
  });
  return out;
}

/* ------------------------------------------------------------- contacts */

export function useContacts(params: { page: number; q?: string }) {
  const sp = new URLSearchParams({ page: String(params.page) });
  if (params.q) sp.set('q', params.q);
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () =>
      api<{
        page: number;
        pageSize: number;
        total: number;
        contacts: WireContact[];
      }>(`/api/contacts?${sp.toString()}`),
    placeholderData: (prev) => prev,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () =>
      api<{ contact: WireContact; deals: WireDeal[] }>(`/api/contacts/${id}`),
    enabled: id.length > 0,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<{ id: string }>('/api/contacts', { method: 'POST', json: input }),
    onSuccess: () => {
      toast.success('Contact created');
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api(`/api/contacts/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------- accounts */

export function useAccounts(params: { page: number; q?: string }) {
  const sp = new URLSearchParams({ page: String(params.page) });
  if (params.q) sp.set('q', params.q);
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: () =>
      api<{
        page: number;
        pageSize: number;
        total: number;
        accounts: WireAccount[];
      }>(`/api/accounts?${sp.toString()}`),
    placeholderData: (prev) => prev,
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: ['account', id],
    queryFn: () =>
      api<{
        account: WireAccount;
        contacts: WireContact[];
        deals: WireDeal[];
      }>(`/api/accounts/${id}`),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<{ id: string }>('/api/accounts', { method: 'POST', json: input }),
    onSuccess: () => {
      toast.success('Account created');
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api(`/api/accounts/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ---------------------------------------------------------------- deals */

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: () =>
      api<{ deals: WireDeal[] }>('/api/deals').then((r) => r.deals),
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: () =>
      api<{ deal: WireDeal; quotes: WireQuote[] }>(`/api/deals/${id}`),
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { contactId: string; title: string; value: number }) =>
      api<{ id: string }>('/api/deals', { method: 'POST', json: input }),
    onSuccess: () => {
      toast.success('Deal created');
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateDeal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<{ deal: WireDeal }>(`/api/deals/${id}`, {
        method: 'PATCH',
        json: patch,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deal', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Kanban drag: optimistic stage move, then server + invalidate. */
export function useMoveDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealId,
      stage,
      lostReason,
    }: {
      dealId: string;
      stage: DealStage;
      lostReason?: string;
    }) =>
      api(`/api/deals/${dealId}`, {
        method: 'PATCH',
        json: { stage, lostReason },
      }),
    onMutate: async ({ dealId, stage }) => {
      await qc.cancelQueries({ queryKey: ['deals'] });
      const prev = qc.getQueryData<WireDeal[]>(['deals']);
      qc.setQueryData<WireDeal[]>(['deals'], (old) =>
        old?.map((d) => (d.id === dealId ? { ...d, stage } : d)),
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['deals'], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

/* --------------------------------------------------------------- quotes */

export function useCreateQuote(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ quote: WireQuote }>(`/api/deals/${dealId}/quotes`, {
        method: 'POST',
        json: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetQuoteStatus(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quoteId, status }: { quoteId: string; status: WireQuote['status'] }) =>
      api(`/api/quotes/${quoteId}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------- products */

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () =>
      api<{ products: WireProduct[] }>('/api/products').then(
        (r) => r.products,
      ),
    staleTime: 60_000,
  });
}

/* -------------------------------------------------------- notifications */

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<{ unread: number; notifications: WireNotification[] }>(
        '/api/notifications',
      ),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/notifications', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/* --------------------------------------------------------------- search */

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      api<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(q)}`,
      ).then((r) => r.results),
    enabled: q.trim().length >= 2,
    placeholderData: (prev) => prev,
  });
}
