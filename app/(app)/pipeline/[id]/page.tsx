'use client';

// Deal workspace: stage stepper, quotation-style product line items that
// drive the deal value, and the activity timeline.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Archive,
  ArrowLeft,
  CalendarPlus,
  Check,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
import { hasCapability } from '@/lib/policy';
import { DealStage } from '@/lib/types';
import { cn, formatINR, whatsappLink } from '@/lib/utils';
import { ActivityDialog } from '@/components/activities/activity-dialog';
import { ActivityTimeline } from '@/components/activities/activity-timeline';
import { EmailDialog } from '@/components/email-dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const OPEN_STAGES: DealStage[] = ['qualification', 'proposal', 'negotiation'];

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    state,
    currentUser,
    stages,
    moveDealStage,
    setDealLineItems,
    setDealExpectedClose,
    updateDealInfo,
    archiveDeal,
    createQuote,
    setQuoteStatus,
  } = useStore();
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editValue, setEditValue] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);

  const deal = state.deals.find((d) => d.id === params.id);

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  if (!currentUser) return null;

  if (!deal || !visible.has(deal.ownerId)) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          This deal does not exist or is outside your visibility scope.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/pipeline">Back to pipeline</Link>
        </Button>
      </div>
    );
  }

  const contact = state.contacts.find((c) => c.id === deal.contactId);
  const owner = state.users.find((u) => u.id === deal.ownerId);
  const isClosed = deal.stage === 'won' || deal.stage === 'lost';
  const items = deal.lineItems ?? [];
  const productById = new Map(state.products.map((p) => [p.id, p]));
  const itemsTotal = items.reduce((s, it) => s + it.qty * it.price, 0);

  function addItem() {
    if (!deal || !productId) return;
    const product = productById.get(productId);
    if (!product) return;
    const existing = items.find((it) => it.productId === productId);
    const next = existing
      ? items.map((it) =>
          it.productId === productId
            ? { ...it, qty: it.qty + (Number(qty) || 1) }
            : it,
        )
      : [
          ...items,
          { productId, qty: Number(qty) || 1, price: product.price },
        ];
    setDealLineItems(deal.id, next);
    setProductId('');
    setQty('1');
  }

  function removeItem(pid: string) {
    if (!deal) return;
    setDealLineItems(
      deal.id,
      items.filter((it) => it.productId !== pid),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/pipeline" aria-label="Back to pipeline">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {deal.title}
            </h1>
            {deal.stage === 'won' && (
              <Badge className="gap-1 border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <Trophy className="h-3 w-3" />
                {stages.won.label}
              </Badge>
            )}
            {deal.stage === 'lost' && (
              <Badge variant="secondary" className="gap-1">
                <X className="h-3 w-3" />
                {stages.lost.label}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {contact?.name ?? 'Unknown contact'}
            {contact?.company ? ` · ${contact.company}` : ''} · owned by{' '}
            {owner?.name ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isClosed && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Edit deal"
              onClick={() => {
                setEditTitle(deal.title);
                setEditValue(String(deal.value));
                setEditOpen(true);
              }}
            >
              <Pencil />
            </Button>
          )}
          {hasCapability(currentUser.role, 'archive_records') && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Archive deal"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive />
            </Button>
          )}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Deal value</p>
            <p className="text-xl font-semibold">{formatINR(deal.value)}</p>
          </div>
        </div>
      </div>

      {/* Stage stepper */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            {OPEN_STAGES.map((s, i) => {
              const stageIndex = OPEN_STAGES.indexOf(
                deal.stage as (typeof OPEN_STAGES)[number],
              );
              const reached = !isClosed && stageIndex >= i;
              const isCurrent = deal.stage === s;
              return (
                <button
                  key={s}
                  disabled={isClosed || isCurrent}
                  onClick={() => moveDealStage(deal.id, s)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : reached || (isClosed && deal.stage === 'won')
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent',
                    (isClosed || isCurrent) && 'cursor-default',
                  )}
                >
                  {(reached || (isClosed && deal.stage === 'won')) &&
                    !isCurrent && <Check className="h-3.5 w-3.5" />}
                  {stages[s].label}
                </button>
              );
            })}
            <div className="mx-1 h-6 w-px bg-border" />
            {!isClosed ? (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => moveDealStage(deal.id, 'won')}
                >
                  <Trophy />
                  Order secured
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    setLostReason('');
                    setLostOpen(true);
                  }}
                >
                  Order lost
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Closed {deal.closedAt && format(new Date(deal.closedAt), 'd MMM yyyy')}
                {deal.stage === 'lost' && deal.lostReason
                  ? ` — ${deal.lostReason}`
                  : ''}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
        <div className="space-y-4">
          {/* Line items / quotation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Products & quotation</CardTitle>
                  <CardDescription>
                    Line items drive the deal value automatically.
                  </CardDescription>
                </div>
                {items.length > 0 && !isClosed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const quoteId = createQuote(deal.id);
                      if (quoteId) router.push(`/quote/${deal.id}`);
                    }}
                  >
                    <FileText />
                    Generate quotation
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isClosed && (
                <div className="flex flex-wrap gap-2">
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger className="min-w-[220px] flex-1">
                      <SelectValue placeholder="Add a product…" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.products
                        .filter((p) => p.active !== false)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {formatINR(p.price)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-20"
                    aria-label="Quantity"
                  />
                  <Button onClick={addItem} disabled={!productId}>
                    <Plus />
                    Add
                  </Button>
                </div>
              )}
              {items.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No line items — the deal value is manual until products are
                  added.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      {!isClosed && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => {
                      const p = productById.get(it.productId);
                      return (
                        <TableRow key={it.productId}>
                          <TableCell>
                            <p className="font-medium">{p?.name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">
                              {p?.sku} · {p?.category}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {it.qty}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(it.price)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatINR(it.qty * it.price)}
                          </TableCell>
                          {!isClosed && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeItem(it.productId)}
                                aria-label="Remove line"
                              >
                                <Trash2 />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-right font-medium"
                      >
                        Total
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatINR(itemsTotal)}
                      </TableCell>
                      {!isClosed && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Activity timeline</CardTitle>
                  <CardDescription>
                    Calls, meetings, tasks and notes on this deal.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {contact?.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 hover:text-green-700 dark:text-green-500"
                      asChild
                    >
                      <a
                        href={whatsappLink(
                          contact.phone,
                          `Hi ${contact.name.split(' ')[0]}, regarding "${deal.title}" —`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                  {contact?.email && (
                    <EmailDialog
                      relatedType="deal"
                      relatedId={deal.id}
                      to={contact.email}
                      trigger={
                        <Button variant="outline" size="sm">
                          <Mail />
                          Email
                        </Button>
                      }
                    />
                  )}
                  <ActivityDialog
                    relatedType="deal"
                    relatedId={deal.id}
                    relatedName={deal.title}
                    trigger={
                      <Button variant="outline" size="sm">
                        <CalendarPlus />
                        Log activity
                      </Button>
                    }
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ActivityTimeline relatedType="deal" relatedId={deal.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
        {/* Quote history */}
        {state.quotes.some((q) => q.dealId === deal.id) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quotations</CardTitle>
              <CardDescription>
                Generated quotes for this deal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {state.quotes
                .filter((q) => q.dealId === deal.id)
                .map((q) => (
                  <div
                    key={q.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    <div>
                      <Link
                        href={`/quote/${deal.id}`}
                        className="font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {q.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(q.createdAt), 'd MMM yyyy')} ·{' '}
                        {formatINR(q.total)} incl. GST
                      </p>
                    </div>
                    <Select
                      value={q.status}
                      onValueChange={(v) =>
                        setQuoteStatus(q.id, v as typeof q.status)
                      }
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <p className="font-medium">{contact?.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                {contact?.phone} {contact?.email && `· ${contact.email}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="font-medium">{owner?.name ?? '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium">
                  {format(new Date(deal.createdAt), 'd MMM yyyy')}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {isClosed ? 'Closed' : 'Expected close'}
                </p>
                {isClosed ? (
                  <p className="font-medium">
                    {format(
                      new Date(deal.closedAt ?? deal.expectedClose),
                      'd MMM yyyy',
                    )}
                  </p>
                ) : (
                  <Input
                    type="date"
                    className="mt-1 h-8"
                    value={format(new Date(deal.expectedClose), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const d = new Date(e.target.value);
                      d.setHours(18, 0, 0, 0);
                      setDealExpectedClose(deal.id, d.toISOString());
                    }}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Edit deal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit deal</DialogTitle>
            {items.length > 0 && (
              <DialogDescription>
                Value is driven by line items and can&apos;t be edited
                directly while products are attached.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="deal-edit-title">Title</Label>
              <Input
                id="deal-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-edit-value">Value (₹)</Label>
              <Input
                id="deal-edit-value"
                type="number"
                min={0}
                disabled={items.length > 0}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!editTitle.trim()}
              onClick={() => {
                updateDealInfo(deal.id, {
                  title: editTitle.trim(),
                  value: Number(editValue) || 0,
                });
                setEditOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive this deal?</DialogTitle>
            <DialogDescription>
              It disappears from the pipeline and metrics; history and quotes
              are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                archiveDeal(deal.id);
                router.push('/pipeline');
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark order as lost</DialogTitle>
            <DialogDescription>
              A short reason helps the team learn from lost orders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="deal-lost-reason">Reason</Label>
            <Input
              id="deal-lost-reason"
              placeholder="e.g. Price, timing, competitor…"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                moveDealStage(deal.id, 'lost', lostReason || undefined);
                setLostOpen(false);
              }}
            >
              Order lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
