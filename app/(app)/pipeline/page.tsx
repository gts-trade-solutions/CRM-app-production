'use client';

// Deal pipeline kanban — API-backed with optimistic drag-and-drop. Stage
// labels and weights come from the database (admin-editable).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { format } from 'date-fns';
import { CalendarDays, GripVertical, IndianRupee } from 'lucide-react';
import {
  WireDeal,
  useDeals,
  useMoveDealStage,
  useStageConfig,
} from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import { DealStage, PIPELINE_STAGES } from '@/lib/types';
import { cn, formatINR, initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function DealCard({
  deal,
  onStageSelect,
  dragging,
}: {
  deal: WireDeal;
  onStageSelect?: (dealId: string, stage: DealStage) => void;
  dragging?: boolean;
}) {
  const stages = useStageConfig();
  const closed = deal.stage === 'won' || deal.stage === 'lost';
  return (
    <Card
      className={cn(
        'space-y-2 p-3 text-sm',
        dragging && 'rotate-2 shadow-lg',
        closed && 'opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pipeline/${deal.id}`}
          className="font-medium leading-snug underline-offset-4 hover:text-primary hover:underline"
        >
          {deal.title}
        </Link>
        {onStageSelect && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                aria-label="Move deal"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {PIPELINE_STAGES.filter((s) => s !== deal.stage).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onStageSelect(deal.id, s)}
                >
                  {stages[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {deal.contact?.name ?? 'Unknown contact'}
      </p>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold">
          <IndianRupee className="h-3.5 w-3.5" />
          {formatINR(deal.value).replace('₹', '')}
        </span>
        {deal.stage === 'lost' && deal.lostReason ? (
          <span
            className="max-w-[120px] truncate text-xs text-muted-foreground"
            title={deal.lostReason}
          >
            {deal.lostReason}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            {format(
              new Date(
                closed && deal.closedAt ? deal.closedAt : deal.expectedClose,
              ),
              'd MMM',
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[9px]">
            {initials(deal.owner?.name ?? '—')}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">
          {deal.owner?.name ?? '—'}
        </span>
      </div>
    </Card>
  );
}

function DraggableCard({
  deal,
  onStageSelect,
}: {
  deal: WireDeal;
  onStageSelect: (dealId: string, stage: DealStage) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab touch-none', isDragging && 'opacity-40')}
    >
      <DealCard deal={deal} onStageSelect={onStageSelect} />
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  onStageSelect,
}: {
  stage: DealStage;
  deals: WireDeal[];
  onStageSelect: (dealId: string, stage: DealStage) => void;
}) {
  const stages = useStageConfig();
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((sum, d) => sum + d.value, 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-lg border border-t-4 bg-muted/40',
        stages[stage].accent,
        isOver && 'ring-2 ring-ring',
      )}
    >
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{stages[stage].label}</span>
          <Badge variant="secondary">{deals.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatINR(total)}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 pt-1">
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} onStageSelect={onStageSelect} />
        ))}
        {deals.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No deals
          </p>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: me } = useMe();
  const { data: deals, isLoading } = useDeals();
  const moveDeal = useMoveDealStage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [losing, setLosing] = useState<{ dealId: string } | null>(null);
  const [lostReason, setLostReason] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byStage = useMemo(() => {
    const map: Record<DealStage, WireDeal[]> = {
      qualification: [],
      proposal: [],
      negotiation: [],
      won: [],
      lost: [],
    };
    for (const d of deals ?? []) map[d.stage].push(d);
    for (const s of PIPELINE_STAGES) {
      map[s].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return map;
  }, [deals]);

  const activeDeal = useMemo(
    () => (deals ?? []).find((d) => d.id === activeId) ?? null,
    [deals, activeId],
  );

  const openValue = byStage.qualification
    .concat(byStage.proposal, byStage.negotiation)
    .reduce((s, d) => s + d.value, 0);
  const wonValue = byStage.won.reduce((s, d) => s + d.value, 0);

  if (!me) return null;

  function requestStageChange(dealId: string, stage: DealStage) {
    if (stage === 'lost') {
      setLosing({ dealId });
      setLostReason('');
    } else {
      moveDeal.mutate({ dealId, stage });
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const dealId = String(event.active.id);
    const target = event.over?.id as DealStage | undefined;
    if (!target || !PIPELINE_STAGES.includes(target)) return;
    requestStageChange(dealId, target);
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Drag deals between stages — or use the handle menu on each card.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Open pipeline</p>
            <p className="font-semibold">{formatINR(openValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Orders secured</p>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatINR(wonValue)}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-72 w-72 shrink-0 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="no-scrollbar flex flex-1 gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                deals={byStage[stage]}
                onStageSelect={requestStageChange}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDeal ? <DealCard deal={activeDeal} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Lost-reason dialog */}
      <Dialog open={!!losing} onOpenChange={(o) => !o && setLosing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark order as lost</DialogTitle>
            <DialogDescription>
              A short reason helps the team learn from lost orders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">Reason</Label>
            <Input
              id="lost-reason"
              placeholder="e.g. Price, timing, competitor…"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLosing(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (losing) {
                  moveDeal.mutate({
                    dealId: losing.dealId,
                    stage: 'lost',
                    lostReason: lostReason || undefined,
                  });
                }
                setLosing(null);
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
