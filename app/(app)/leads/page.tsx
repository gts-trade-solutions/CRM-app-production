'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowRightCircle,
  CloudOff,
  FileUp,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { assignableUsers, visibleUserIds } from '@/lib/rbac';
import { hasCapability } from '@/lib/policy';
import {
  Channel,
  LEAD_STATUS_CONFIG,
  Lead,
  LeadStatus,
  SOURCE_CONFIG,
} from '@/lib/types';
import { cn, formatINR } from '@/lib/utils';
import { leadScore, scoreTier } from '@/lib/scoring';
import { ImportLeadsDialog } from '@/components/leads/import-dialog';
import { LeadFormDialog } from '@/components/leads/lead-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
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

export default function LeadsPage() {
  const { state, currentUser, setLeadStatus, convertLead, reassignLeads } =
    useStore();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reassignTo, setReassignTo] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | Channel>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'score'>('newest');
  const [converting, setConverting] = useState<Lead | null>(null);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  const userById = useMemo(
    () => new Map(state.users.map((u) => [u.id, u])),
    [state.users],
  );

  // Activity count per lead feeds the engagement part of the score.
  const activityCountByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of state.salesActivities) {
      if (a.relatedType !== 'lead') continue;
      map.set(a.relatedId, (map.get(a.relatedId) ?? 0) + 1);
    }
    return map;
  }, [state.salesActivities]);

  const scoreById = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of state.leads) {
      map.set(l.id, leadScore(l, activityCountByLead.get(l.id) ?? 0));
    }
    return map;
  }, [state.leads, activityCountByLead]);

  const leads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.leads
      .filter((l) => visible.has(l.ownerId))
      .filter((l) => statusFilter === 'all' || l.status === statusFilter)
      .filter(
        (l) =>
          channelFilter === 'all' ||
          SOURCE_CONFIG[l.source].channel === channelFilter,
      )
      .filter(
        (l) =>
          !q ||
          l.name.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        sortBy === 'score'
          ? (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0)
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [state.leads, visible, statusFilter, channelFilter, search, sortBy, scoreById]);

  const pendingCount = state.leads.filter(
    (l) => l.pendingSync && visible.has(l.ownerId),
  ).length;

  function openConvert(lead: Lead) {
    setConverting(lead);
    setDealTitle(
      lead.company ? `${lead.company} — New opportunity` : `${lead.name} — New opportunity`,
    );
    setDealValue(String(lead.estimatedValue || ''));
  }

  function handleConvert() {
    if (!converting) return;
    const dealId = convertLead(converting.id, dealTitle, Number(dealValue) || 0);
    setConverting(null);
    // Land the rep on the new deal so the next action is obvious.
    if (dealId) router.push(`/pipeline/${dealId}`);
  }

  if (!currentUser) return null;

  const canReassign = hasCapability(currentUser.role, 'reassign_records');
  const reassignTargets = assignableUsers(state.users, currentUser).filter(
    (u) => u.active !== false,
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <CloudOff className="h-4 w-4 shrink-0" />
          {pendingCount} lead{pendingCount > 1 ? 's' : ''} captured offline —
          will sync automatically when the connection returns.
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
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
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
          onValueChange={(v) => setChannelFilter(v as typeof channelFilter)}
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

      {/* Bulk reassignment toolbar */}
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
            disabled={!reassignTo}
            onClick={() => {
              reassignLeads(Array.from(selected), reassignTo);
              setSelected(new Set());
              setReassignTo('');
            }}
          >
            Reassign
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
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
              {leads.length === 0 && (
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
                const owner = userById.get(lead.ownerId);
                const open =
                  lead.status !== 'converted' && lead.status !== 'disqualified';
                const score = scoreById.get(lead.id) ?? 0;
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
                        {(lead.attachments?.length ?? 0) > 0 && (
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {lead.pendingSync && (
                          <Badge variant="outline" className="gap-1 text-amber-600">
                            <CloudOff className="h-3 w-3" />
                            queued
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {open ? (
                        <Badge
                          variant="outline"
                          className={cn('border-transparent tabular-nums', tier.className)}
                          title="Source quality + value + freshness + engagement"
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
                      {owner?.name ?? '—'}
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
                              onClick={() => setLeadStatus(lead.id, 'contacted')}
                            >
                              Mark contacted
                            </DropdownMenuItem>
                          )}
                          {open && lead.status !== 'qualified' && (
                            <DropdownMenuItem
                              onClick={() => setLeadStatus(lead.id, 'qualified')}
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
                                  setLeadStatus(lead.id, 'disqualified')
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

      {/* Convert dialog: creates a contact + a deal in Qualification */}
      <Dialog
        open={!!converting}
        onOpenChange={(o) => !o && setConverting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert lead</DialogTitle>
            <DialogDescription>
              Converting {converting?.name} creates a contact and opens a Cold
              deal in the pipeline. You&apos;ll be taken straight to it.
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
              onClick={handleConvert}
              disabled={!dealTitle.trim()}
            >
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
