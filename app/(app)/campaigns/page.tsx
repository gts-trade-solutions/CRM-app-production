'use client';

// Campaigns — API-backed: funnel metrics auto-computed server-side;
// budget/spend/status manually editable by managers.

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Megaphone, Pencil, Plus } from 'lucide-react';
import {
  WireCampaignWithMetrics,
  useCampaignsWithMetrics,
  useCreateCampaign,
  useUpdateCampaign,
} from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import { hasCapability } from '@/lib/policy';
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
  const { data: me } = useMe();
  const { data: campaigns, isLoading } = useCampaignsWithMetrics();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'online' | 'offline'>('online');
  const [budget, setBudget] = useState('');
  const [editing, setEditing] = useState<WireCampaignWithMetrics | null>(null);
  const [editBudget, setEditBudget] = useState('');
  const [editSpend, setEditSpend] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'completed'>(
    'active',
  );

  if (!me) return null;
  const canManage = hasCapability(me.role, 'manage_campaigns');

  function submit() {
    if (!name.trim()) return;
    createCampaign.mutate(
      { name: name.trim(), channel, budget: Number(budget) || 0 },
      {
        onSuccess: () => {
          setName('');
          setBudget('');
          setChannel('online');
          setOpen(false);
        },
      },
    );
  }

  function openEdit(campaign: WireCampaignWithMetrics) {
    setEditing(campaign);
    setEditBudget(String(campaign.budget || ''));
    setEditSpend(campaign.spend != null ? String(campaign.spend) : '');
    setEditStatus(campaign.status);
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
        {canManage && (
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
                  Leads captured with this campaign selected will be
                  attributed to it.
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
                      onValueChange={(v) =>
                        setChannel(v as 'online' | 'offline')
                      }
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
                <Button
                  onClick={submit}
                  disabled={!name.trim() || createCampaign.isPending}
                >
                  Launch campaign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (campaigns ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No campaigns yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(campaigns ?? []).map((campaign) => {
            const m = campaign.metrics ?? {
              leadCount: 0,
              convertedCount: 0,
              pipeline: 0,
              won: 0,
            };
            const costBase = campaign.spend || campaign.budget;
            const roi = costBase > 0 ? m.won / costBase : 0;
            return (
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
                          Since{' '}
                          {format(new Date(campaign.startDate), 'd MMM yyyy')} ·
                          budget {formatINR(campaign.budget)}
                          {campaign.spend != null &&
                            ` · spent ${formatINR(campaign.spend)}`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
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
                      {canManage && (
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
                        {m.leadCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Leads</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <p className="text-lg font-semibold tabular-nums">
                        {m.convertedCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <p className="text-lg font-semibold tabular-nums">
                        {m.pipeline > 0 ? formatINR(m.pipeline) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Pipeline</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <p className="text-lg font-semibold tabular-nums">
                        {m.won > 0 ? formatINR(m.won) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Secured</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {m.won > 0
                        ? `Return so far: ${roi.toFixed(1)}× of ${campaign.spend ? 'spend' : 'budget'} — updates automatically as attributed deals close.`
                        : m.convertedCount > 0
                          ? 'Converted leads in pipeline — revenue updates automatically when orders are secured.'
                          : 'No conversions attributed yet.'}
                    </p>
                    {m.leadCount > 0 && (
                      <Link
                        href={`/leads?campaign=${campaign.id}`}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        View leads →
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit campaign */}
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
            <Button
              disabled={updateCampaign.isPending}
              onClick={() => {
                if (!editing) return;
                updateCampaign.mutate(
                  {
                    id: editing.id,
                    budget: Number(editBudget) || 0,
                    spend: editSpend === '' ? null : Number(editSpend) || 0,
                    status: editStatus,
                  },
                  { onSuccess: () => setEditing(null) },
                );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
