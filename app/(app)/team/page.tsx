'use client';

// Workforce hierarchy. Renders the org tree from the signed-in user down —
// exactly the slice of the organisation their role lets them see — with
// per-member performance rolled up from leads and deals. Managers can add
// members at levels strictly below their own.

import { useMemo, useState } from 'react';
import { isSameMonth } from 'date-fns';
import { ChevronRight, Plus, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStore } from '@/lib/store';
import {
  canManageWorkforce,
  creatableRoles,
  managerChain,
  subordinateIds,
  visibleUserIds,
} from '@/lib/rbac';
import { RequireCapability } from '@/components/require-capability';
import { ROLE_LABELS, ROLE_LEVEL, Role, User } from '@/lib/types';
import { cn, formatINR, initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

interface MemberStats {
  leads: number;
  openDeals: number;
  wonValue: number;
  /** Closed-won value in the current calendar month. */
  wonMonth: number;
}

const memberSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.string().min(1, 'Pick a role'),
  managerId: z.string().min(1, 'Pick a manager'),
  region: z.string().min(1, 'Region is required'),
  title: z.string().min(2, 'Title is required'),
});

type MemberFormValues = z.infer<typeof memberSchema>;

function MemberNode({
  user,
  users,
  stats,
  targets,
  currentUserId,
  depth,
}: {
  user: User;
  users: User[];
  stats: Map<string, MemberStats>;
  targets: Record<string, number>;
  currentUserId: string;
  depth: number;
}) {
  const reports = users
    .filter((u) => u.managerId === user.id && u.active !== false)
    .sort((a, b) => ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] || a.name.localeCompare(b.name));
  const s =
    stats.get(user.id) ??
    ({ leads: 0, openDeals: 0, wonValue: 0, wonMonth: 0 } as MemberStats);
  // Manager quotas cover their whole subtree, so attainment for a manager
  // is measured on the rolled-up won value of self + reports this month.
  const subtreeWonMonth = [user.id, ...subordinateIds(users, user.id)].reduce(
    (sum, id) => sum + (stats.get(id)?.wonMonth ?? 0),
    0,
  );
  const target = targets[user.id] ?? 0;
  const attainment =
    target > 0 ? Math.round((subtreeWonMonth / target) * 100) : 0;

  return (
    <div className={cn(depth > 0 && 'ml-4 border-l pl-4 md:ml-6 md:pl-6')}>
      <div
        className={cn(
          'mb-2 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3',
          user.id === currentUserId && 'border-primary/50 bg-primary/5',
        )}
      >
        <Avatar>
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{user.name}</p>
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            {user.id === currentUserId && (
              <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                You
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {user.title} · {user.region}
          </p>
        </div>
        <div className="flex gap-4 text-right text-xs">
          <div>
            <p className="font-semibold">{s.leads}</p>
            <p className="text-muted-foreground">Leads</p>
          </div>
          <div>
            <p className="font-semibold">{s.openDeals}</p>
            <p className="text-muted-foreground">Open deals</p>
          </div>
          <div>
            <p className="font-semibold">{formatINR(s.wonValue)}</p>
            <p className="text-muted-foreground">Won</p>
          </div>
        </div>
        {target > 0 && (
          <div className="w-full basis-full">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Monthly target</span>
              <span className="tabular-nums">
                {formatINR(subtreeWonMonth)} / {formatINR(target)} ·{' '}
                {attainment}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.min(attainment, 100)}%`,
                  background: 'var(--viz-cat-1)',
                }}
              />
            </div>
          </div>
        )}
      </div>
      {reports.map((r) => (
        <MemberNode
          key={r.id}
          user={r}
          users={users}
          stats={stats}
          targets={targets}
          currentUserId={currentUserId}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export default function TeamPage() {
  return (
    <RequireCapability capability="view_team">
      <TeamPageContent />
    </RequireCapability>
  );
}

function TeamPageContent() {
  const { state, currentUser, addMember } = useStore();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '',
      email: '',
      role: '',
      managerId: currentUser?.id ?? '',
      region: currentUser?.region ?? '',
      title: '',
    },
  });

  const stats = useMemo(() => {
    const map = new Map<string, MemberStats>();
    for (const u of state.users) {
      map.set(u.id, { leads: 0, openDeals: 0, wonValue: 0, wonMonth: 0 });
    }
    const now = new Date();
    for (const lead of state.leads) {
      const s = map.get(lead.ownerId);
      if (s) s.leads += 1;
    }
    for (const deal of state.deals) {
      const s = map.get(deal.ownerId);
      if (!s) continue;
      if (deal.stage === 'won') {
        s.wonValue += deal.value;
        if (deal.closedAt && isSameMonth(new Date(deal.closedAt), now)) {
          s.wonMonth += deal.value;
        }
      } else if (deal.stage !== 'lost') {
        s.openDeals += 1;
      }
    }
    return map;
  }, [state.users, state.leads, state.deals]);

  if (!currentUser) return null;

  const chain = managerChain(state.users, currentUser).reverse();
  const teamSize = subordinateIds(state.users, currentUser.id).length;
  const visibleCount = visibleUserIds(state.users, currentUser).size;
  const roles = creatableRoles(currentUser);

  // Valid managers for the chosen role: visible members whose level is
  // strictly above the new member's level.
  const chosenRole = watch('role') as Role | '';
  const possibleManagers = state.users.filter(
    (u) =>
      visibleUserIds(state.users, currentUser).has(u.id) &&
      chosenRole &&
      ROLE_LEVEL[u.role] < ROLE_LEVEL[chosenRole as Role],
  );

  function onSubmit(values: MemberFormValues) {
    addMember({
      name: values.name,
      email: values.email,
      role: values.role as Role,
      managerId: values.managerId,
      region: values.region,
      title: values.title,
    });
    reset();
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Your slice of the workforce hierarchy — {visibleCount} member
            {visibleCount > 1 ? 's' : ''} visible, {teamSize} reporting to you.
          </p>
        </div>
        {canManageWorkforce(currentUser) && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                Add member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add workforce member</DialogTitle>
                <DialogDescription>
                  You can add roles below your own level (
                  {ROLE_LABELS[currentUser.role]}).
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-name">Name *</Label>
                    <Input id="m-name" {...register('name')} />
                    {errors.name && (
                      <p className="text-xs text-destructive">
                        {errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-email">Email *</Label>
                    <Input id="m-email" type="email" {...register('email')} />
                    {errors.email && (
                      <p className="text-xs text-destructive">
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role *</Label>
                    <Select
                      value={chosenRole}
                      onValueChange={(v) => {
                        setValue('role', v, { shouldValidate: true });
                        setValue('managerId', '');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.role && (
                      <p className="text-xs text-destructive">
                        {errors.role.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reports to *</Label>
                    <Select
                      value={watch('managerId')}
                      onValueChange={(v) =>
                        setValue('managerId', v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger disabled={!chosenRole}>
                        <SelectValue
                          placeholder={chosenRole ? 'Select manager' : 'Pick role first'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {possibleManagers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({ROLE_LABELS[u.role]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.managerId && (
                      <p className="text-xs text-destructive">
                        {errors.managerId.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-region">Region *</Label>
                    <Input id="m-region" {...register('region')} />
                    {errors.region && (
                      <p className="text-xs text-destructive">
                        {errors.region.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-title">Job title *</Label>
                    <Input id="m-title" {...register('title')} />
                    {errors.title && (
                      <p className="text-xs text-destructive">
                        {errors.title.message}
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Add member</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {chain.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reporting line above you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {chain.map((m, i) => (
                <span key={m.id} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="flex items-center gap-1.5 rounded-full border px-3 py-1">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    {m.name}
                    <span className="text-xs text-muted-foreground">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </span>
                </span>
              ))}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="rounded-full border border-primary/50 bg-primary/5 px-3 py-1 font-medium">
                You
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Organisation</CardTitle>
          <CardDescription>
            Records owned by anyone in this tree are visible to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberNode
            user={currentUser}
            users={state.users}
            stats={stats}
            targets={state.targets}
            currentUserId={currentUser.id}
            depth={0}
          />
        </CardContent>
      </Card>
    </div>
  );
}
