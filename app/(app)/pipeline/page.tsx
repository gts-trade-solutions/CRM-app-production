'use client';

// Deal pipeline as a drag-and-drop kanban. Dragging a card onto a column
// moves the deal to that stage; dropping on Lost first asks for a reason.
// A stage dropdown on each card covers touch devices without drag.

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
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
import { Deal, DealStage, PIPELINE_STAGES } from '@/lib/types';
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

interface CardData {
  deal: Deal;
  contactName: string;
  ownerName: string;
}

function DealCard({
  data,
  onStageSelect,
  dragging,
}: {
  data: CardData;
  onStageSelect?: (dealId: string, stage: DealStage) => void;
  dragging?: boolean;
}) {
  const { stages } = useStore();
  const { deal, contactName, ownerName } = data;
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
      <p className="text-xs text-muted-foreground">{contactName}</p>
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
              new Date(closed && deal.closedAt ? deal.closedAt : deal.expectedClose),
              'd MMM',
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[9px]">
            {initials(ownerName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">{ownerName}</span>
      </div>
    </Card>
  );
}

function DraggableCard({
  data,
  onStageSelect,
}: {
  data: CardData;
  onStageSelect: (dealId: string, stage: DealStage) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: data.deal.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab touch-none', isDragging && 'opacity-40')}
    >
      <DealCard data={data} onStageSelect={onStageSelect} />
    </div>
  );
}

function StageColumn({
  stage,
  cards,
  onStageSelect,
}: {
  stage: DealStage;
  cards: CardData[];
  onStageSelect: (dealId: string, stage: DealStage) => void;
}) {
  const { stages } = useStore();
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = cards.reduce((sum, c) => sum + c.deal.value, 0);
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
          <Badge variant="secondary">{cards.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatINR(total)}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 pt-1">
        {cards.map((c) => (
          <DraggableCard key={c.deal.id} data={c} onStageSelect={onStageSelect} />
        ))}
        {cards.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No deals
          </p>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { state, currentUser, moveDealStage } = useStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [losing, setLosing] = useState<{ dealId: string } | null>(null);
  const [lostReason, setLostReason] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  const cardsByStage = useMemo(() => {
    const contactById = new Map(state.contacts.map((c) => [c.id, c]));
    const userById = new Map(state.users.map((u) => [u.id, u]));
    const map: Record<DealStage, CardData[]> = {
      qualification: [],
      proposal: [],
      negotiation: [],
      won: [],
      lost: [],
    };
    for (const deal of state.deals) {
      if (!visible.has(deal.ownerId) || deal.archived) continue;
      map[deal.stage].push({
        deal,
        contactName: contactById.get(deal.contactId)?.name ?? 'Unknown contact',
        ownerName: userById.get(deal.ownerId)?.name ?? '—',
      });
    }
    for (const stage of PIPELINE_STAGES) {
      map[stage].sort(
        (a, b) =>
          new Date(b.deal.createdAt).getTime() -
          new Date(a.deal.createdAt).getTime(),
      );
    }
    return map;
  }, [state.deals, state.contacts, state.users, visible]);

  const activeCard = useMemo(() => {
    if (!activeId) return null;
    for (const stage of PIPELINE_STAGES) {
      const found = cardsByStage[stage].find((c) => c.deal.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, cardsByStage]);

  const openValue =
    cardsByStage.qualification
      .concat(cardsByStage.proposal, cardsByStage.negotiation)
      .reduce((sum, c) => sum + c.deal.value, 0);
  const wonValue = cardsByStage.won.reduce((sum, c) => sum + c.deal.value, 0);

  function requestStageChange(dealId: string, stage: DealStage) {
    if (stage === 'lost') {
      setLosing({ dealId });
      setLostReason('');
    } else {
      moveDealStage(dealId, stage);
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

  if (!currentUser) return null;

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
              cards={cardsByStage[stage]}
              onStageSelect={requestStageChange}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <DealCard data={activeCard} dragging /> : null}
        </DragOverlay>
      </DndContext>

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
                  moveDealStage(losing.dealId, 'lost', lostReason || undefined);
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
