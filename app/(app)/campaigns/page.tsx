'use client';

// Campaigns: marketing pushes (online or offline) that leads are attributed
// to, with per-campaign funnel metrics and return against budget.

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Megaphone, Pencil, Plus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { canManageWorkforce, visibleUserIds } from '@/lib/rbac';
import { Campaign, Channel } from '@/lib/types';
import { cn, formatINR } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CampaignsPage() {
  const { state, currentUser, addCampaign, updateCampaign } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>('online');
  const [budget, setBudget] = useState('');
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editBudget, setEditBudget] = useState('');
  const [editSpend, setEditSpend] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'completed'>('active');

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  // Per-campaign funnel: leads → converted → deals (via lead-born contacts)
  // → won revenue vs budget.
  const rows = useMemo(() => {
    const contactByLead = new Map(
      state.contacts.filter((c) => c.leadId).map((c) => [c.leadId!, c.id]),
    );
    return state.campaigns
      .map((campaign) => {
        const leads = state.leads.filter(
          (l) => l.campaignId === campaign.id && visible.has(l.ownerId),
        );
        const converted = leads.filter((l) => l.status === 'converted');
        const contactIds = new Set(
          converted
            .map((l) => contactByLead.get(l.id))
            .filter((id): id is string => !!id),
        );
        const deals = state.deals.filter((d) => contactIds.has(d.contactId));
        const pipeline = deals
          .filter((d) => d.stage !== 'won' && d.stage !== 'lost')
          .reduce((s, d) => s + d.value, 0);
        const won = deals
          .filter((d) => d.stage === 'won')
          .reduce((s, d) => s + d.value, 0);
        // ROI is measured against actual spend when recorded, else budget.
        const costBase = campaign.spend || campaign.budget;
        return {
          campaign,
          leadCount: leads.length,
          convertedCount: converted.length,
          pipeline,
          won,
          roi: costBase > 0 ? won / costBase : 0,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.campaign.startDate).getTime() -
          new Date(a.campaign.startDate).getTime(),
      );
  }, [state.campaigns, state.leads, state.contacts, state.deals, visible]);

  if (!currentUser) return null;

  function submit() {
    if (!name.trim()) return;
    addCampaign({
      name: name.trim(),
      channel,
      budget: Number(budget) || 0,
    });
    setName('');
    setBudget('');
    setChannel('online');
    setOpen(false);
  }

  function openEdit(campaign: Campaign) {
    setEditing(campaign);
    setEditBudget(String(campaign.budget || ''));
    setEditSpend(String(campaign.spend ?? ''));
    setEditStatus(campaign.status);
  }

  function saveEdit() {
    if (!editing) return;
    updateCampaign(editing.id, {
      budget: Number(editBudget) || 0,
      spend: editSpend === '' ? undefined : Number(editSpend) || 0,
      status: editStatus,
    });
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Attribute leads to marketing pushes and track return on spend.
          </p>
        </div>
        {canManageWorkforce(currentUser) && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                New campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New campaign</DialogTitle>
                <DialogDescription>
                  Leads captured with this campaign selected will be attributed
                  to it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cmp-name">Name *</Label>
                  <Input
                    id="cmp-name"
                    placeholder="e.g. Diwali Dealer Meet 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Channel</Label>
                    <Select
                      value={channel}
                      onValueChange={(v) => setChannel(v as Channel)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cmp-budget">Budget (₹)</Label>
                    <Input
                      id="cmp-budget"
                      type="number"
                      min={0}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={!name.trim()}>
                  Launch campaign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No campaigns yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ campaign, leadCount, convertedCount, pipeline, won, roi }) => (
            <Card key={campaign.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {campaign.name}
                      </CardTitle>
                      <CardDescription>
                        Since {format(new Date(campaign.startDate), 'd MMM yyyy')} ·
                        budget {formatINR(campaign.budget)}
                        {campaign.spend != null &&
                          ` · spent ${formatINR(campaign.spend)}`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <span
                      className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background:
                            campaign.channel === 'online'
                              ? 'var(--viz-cat-1)'
                              : 'var(--viz-cat-2)',
                        }}
                      />
                      {campaign.channel === 'online' ? 'Online' : 'Offline'}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        campaign.status === 'active' &&
                          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                      )}
                    >
                      {campaign.status === 'active' ? 'Active' : 'Completed'}
                    </Badge>
                    {canManageWorkforce(currentUser) && (
                      <button
                        aria-label={`Edit ${campaign.name}`}
                        onClick={() => openEdit(campaign)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-lg font-semibold tabular-nums">
                      {leadCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-lg font-semibold tabular-nums">
                      {convertedCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Converted</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-lg font-semibold tabular-nums">
                      {pipeline > 0 ? formatINR(pipeline) : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">Pipeline</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2.5">
                    <p className="text-lg font-semibold tabular-nums">
                      {won > 0 ? formatINR(won) : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">Won</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {won > 0
                    ? `Return so far: ${roi.toFixed(1)}× of ${campaign.spend ? 'spend' : 'budget'} — updates automatically as attributed deals close.`
                    : convertedCount > 0
                      ? 'Converted leads in pipeline — revenue updates automatically when orders are secured.'
                      : 'No conversions attributed yet.'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit budget / actual spend / status. Funnel and revenue figures
          are computed from attributed leads and deals — never hand-entered. */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>
              Budget and spend are manual; leads, pipeline and secured revenue
              are tracked automatically from attributed records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ce-budget">Budget (₹)</Label>
                <Input
                  id="ce-budget"
                  type="number"
                  min={0}
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ce-spend">Actual spend (₹)</Label>
                <Input
                  id="ce-spend"
                  type="number"
                  min={0}
                  placeholder="Not recorded"
                  value={editSpend}
                  onChange={(e) => setEditSpend(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) =>
                  setEditStatus(v as 'active' | 'completed')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
