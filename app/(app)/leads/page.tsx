'use client';

// Leads list — API-backed: server-side pagination, filtering and RBAC
// scoping. The offline outbox flushes automatically on reconnect.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowRightCircle,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  FileUp,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
} from 'lucide-react';
import {
  WireLead,
  useLeads,
  useMe,
  useApiUsers,
  useConvertLead,
  useOutboxFlusher,
  useReassignLeads,
  useUpdateLead,
  outboxCount,
} from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { hasCapability } from '@/lib/policy';
import { LEAD_STATUS_CONFIG, LeadStatus, SOURCE_CONFIG } from '@/lib/types';
import { cn, formatINR } from '@/lib/utils';
import { leadScore, scoreTier } from '@/lib/scoring';
import { ImportLeadsDialog } from '@/components/leads/import-dialog';
import { LeadFormDialog } from '@/components/leads/lead-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Row-level status change without a per-row hook instance. */
function useLeadStatusMutation() {
  const qc = useQueryClient();
  return async (leadId: string, status: LeadStatus) => {
    await api(`/api/leads/${leadId}`, { method: 'PATCH', json: { status } });
    qc.invalidateQueries({ queryKey: ['leads'] });
  };
}

export default function LeadsPage() {
  const { data: me } = useMe();
  const { data: users } = useApiUsers();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'score'>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignTo, setReassignTo] = useState('');
  const [converting, setConverting] = useState<WireLead | null>(null);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [queued, setQueued] = useState(0);

  const setStatus = useLeadStatusMutation();
  const convert = useConvertLead();
  const reassign = useReassignLeads();
  const flushOutbox = useOutboxFlusher();

  // Debounced server-side search.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Offline outbox: show count, flush on reconnect.
  useEffect(() => {
    setQueued(outboxCount());
    const onOnline = () => flushOutbox().then(() => setQueued(outboxCount()));
    const interval = setInterval(() => setQueued(outboxCount()), 4000);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useLeads({
    page,
    status: statusFilter,
    channel: channelFilter,
    q: debouncedQ,
  });

  const leads = useMemo(() => {
    const rows = data?.leads ?? [];
    if (sortBy === 'score') {
      return [...rows].sort(
        (a, b) =>
          leadScore(b, b.activityCount ?? 0) -
          leadScore(a, a.activityCount ?? 0),
      );
    }
    return rows;
  }, [data, sortBy]);

  if (!me) return null;

  const canReassign = hasCapability(me.role, 'reassign_records');
  const reassignTargets = (users ?? []).filter((u) => u.active);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openConvert(lead: WireLead) {
    setConverting(lead);
    setDealTitle(
      lead.company
        ? `${lead.company} — New opportunity`
        : `${lead.name} — New opportunity`,
    );
    setDealValue(String(lead.estimatedValue || ''));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Online and offline lead capture, qualification and conversion.
          </p>
        </div>
        <div className="flex gap-2">
          <ImportLeadsDialog
            trigger={
              <Button variant="outline">
                <FileUp />
                Import CSV
              </Button>
            }
          />
          <LeadFormDialog
            trigger={
              <Button>
                <Plus />
                New lead
              </Button>
            }
          />
        </div>
      </div>

      {queued > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <CloudOff className="h-4 w-4 shrink-0" />
          {queued} lead{queued > 1 ? 's' : ''} captured offline — will sync
          automatically when the connection returns.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, company, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as typeof statusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(LEAD_STATUS_CONFIG) as LeadStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={channelFilter}
          onValueChange={(v) => {
            setChannelFilter(v as typeof channelFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as typeof sortBy)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Sort: Newest</SelectItem>
            <SelectItem value="score">Sort: Score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canReassign && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2.5">
          <Badge variant="secondary">{selected.size} selected</Badge>
          <Select value={reassignTo} onValueChange={setReassignTo}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Reassign to…" />
            </SelectTrigger>
            <SelectContent>
              {reassignTargets.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!reassignTo || reassign.isPending}
            onClick={() =>
              reassign.mutate(
                { leadIds: Array.from(selected), newOwnerId: reassignTo },
                {
                  onSuccess: () => {
                    setSelected(new Set());
                    setReassignTo('');
                  },
                },
              )
            }
          >
            Reassign
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {canReassign && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="h-4 w-4 accent-primary"
                      checked={
                        leads.length > 0 &&
                        leads.every((l) => selected.has(l.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(leads.map((l) => l.id))
                            : new Set(),
                        )
                      }
                    />
                  </TableHead>
                )}
                <TableHead>Lead</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Est. value</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={`s-${i}`}>
                    <TableCell colSpan={canReassign ? 9 : 8}>
                      <div className="h-8 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && leads.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canReassign ? 9 : 8}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No leads match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {leads.map((lead) => {
                const source = SOURCE_CONFIG[lead.source];
                const status = LEAD_STATUS_CONFIG[lead.status];
                const open =
                  lead.status !== 'converted' && lead.status !== 'disqualified';
                const score = leadScore(lead, lead.activityCount ?? 0);
                const tier = scoreTier(score);
                return (
                  <TableRow key={lead.id}>
                    {canReassign && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${lead.name}`}
                          className="h-4 w-4 accent-primary"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <Link
                            href={`/leads/${lead.id}`}
                            className="font-medium underline-offset-4 hover:text-primary hover:underline"
                          >
                            {lead.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {lead.company || lead.email || lead.phone}
                          </p>
                        </div>
                        {(lead.attachmentCount ?? 0) > 0 && (
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {open ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'border-transparent tabular-nums',
                            tier.className,
                          )}
                        >
                          {tier.label} {score}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            source.channel === 'online'
                              ? 'bg-sky-500'
                              : 'bg-orange-500',
                          )}
                        />
                        <span className="text-sm">{source.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {lead.owner?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('border-transparent', status.className)}
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {lead.estimatedValue
                        ? formatINR(lead.estimatedValue)
                        : '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {format(new Date(lead.createdAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Update status</DropdownMenuLabel>
                          {open && lead.status !== 'contacted' && (
                            <DropdownMenuItem
                              onClick={() => setStatus(lead.id, 'contacted')}
                            >
                              Mark contacted
                            </DropdownMenuItem>
                          )}
                          {open && lead.status !== 'qualified' && (
                            <DropdownMenuItem
                              onClick={() => setStatus(lead.id, 'qualified')}
                            >
                              Mark qualified
                            </DropdownMenuItem>
                          )}
                          {open && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openConvert(lead)}>
                                <ArrowRightCircle />
                                Convert to deal
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  setStatus(lead.id, 'disqualified')
                                }
                              >
                                Disqualify
                              </DropdownMenuItem>
                            </>
                          )}
                          {!open && (
                            <DropdownMenuItem disabled>
                              No actions — lead is {lead.status}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Server-side pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data ? `${data.total} lead${data.total === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft />
            Prev
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={!!converting} onOpenChange={(o) => !o && setConverting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert lead</DialogTitle>
            <DialogDescription>
              Converting {converting?.name} creates a contact, links the
              account, and opens a Cold deal — atomically, on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="deal-title">Deal title</Label>
              <Input
                id="deal-title"
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-value">Deal value (₹)</Label>
              <Input
                id="deal-value"
                type="number"
                min={0}
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!dealTitle.trim() || convert.isPending}
              onClick={() => {
                if (!converting) return;
                convert.mutate(
                  {
                    leadId: converting.id,
                    dealTitle,
                    value: Number(dealValue) || 0,
                  },
                  { onSuccess: () => setConverting(null) },
                );
              }}
            >
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
