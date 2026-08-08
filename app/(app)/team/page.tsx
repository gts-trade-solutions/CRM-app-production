'use client';

// Workforce hierarchy — API-backed: the actor's subtree with per-member
// performance and target attainment (manager quotas roll up their
// subtree's secured orders).

import { useMemo, useState } from 'react';
import { ChevronRight, Copy, Plus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  TeamMember,
  useAddMember,
  useTeam,
} from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import { hasCapability } from '@/lib/policy';
import { ROLE_LABELS, ROLE_LEVEL, Role } from '@/lib/types';
import { cn, formatINR, initials } from '@/lib/utils';
import { RequireCapability } from '@/components/require-capability';
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

function subtreeIds(users: TeamMember[], rootId: string): string[] {
  const byManager = new Map<string, TeamMember[]>();
  for (const u of users) {
    if (!u.managerId) continue;
    const list = byManager.get(u.managerId) ?? [];
    list.push(u);
    byManager.set(u.managerId, list);
  }
  const out: string[] = [];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of byManager.get(cur) ?? []) {
      out.push(r.id);
      queue.push(r.id);
    }
  }
  return out;
}

function MemberNode({
  user,
  users,
  targets,
  currentUserId,
  depth,
}: {
  user: TeamMember;
  users: TeamMember[];
  targets: Record<string, number>;
  currentUserId: string;
  depth: number;
}) {
  const reports = users
    .filter((u) => u.managerId === user.id && u.active)
    .sort(
      (a, b) =>
        ROLE_LEVEL[a.role as Role] - ROLE_LEVEL[b.role as Role] ||
        a.name.localeCompare(b.name),
    );
  const s = user.stats ?? {
    leads: 0,
    openDeals: 0,
    securedValue: 0,
    securedMonth: 0,
  };
  const subtreeMonth = [user.id, ...subtreeIds(users, user.id)].reduce(
    (sum, id) =>
      sum + (users.find((u) => u.id === id)?.stats?.securedMonth ?? 0),
    0,
  );
  const target = targets[user.id] ?? 0;
  const attainment = target > 0 ? Math.round((subtreeMonth / target) * 100) : 0;

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
            <Badge variant="secondary">
              {ROLE_LABELS[user.role as Role]}
            </Badge>
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
            <p className="font-semibold">{formatINR(s.securedValue)}</p>
            <p className="text-muted-foreground">Secured</p>
          </div>
        </div>
        {target > 0 && (
          <div className="w-full basis-full">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Monthly target</span>
              <span className="tabular-nums">
                {formatINR(subtreeMonth)} / {formatINR(target)} · {attainment}%
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
  const { data: me } = useMe();
  const { data: team, isLoading } = useTeam();
  const addMember = useAddMember();

  const [open, setOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: '' as Role | '',
    managerId: '',
    region: '',
    title: '',
  });

  const creatable = useMemo(() => {
    if (!me) return [] as Role[];
    return (Object.keys(ROLE_LEVEL) as Role[]).filter(
      (r) => ROLE_LEVEL[r] > ROLE_LEVEL[me.role],
    );
  }, [me]);

  if (!me) return null;

  if (isLoading || !team) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded bg-muted" />
        <div className="h-72 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const self = team.users.find((u) => u.id === me.id);
  const chain = [...team.chain].reverse();
  const possibleManagers = form.role
    ? team.users.filter(
        (u) =>
          u.active && ROLE_LEVEL[u.role as Role] < ROLE_LEVEL[form.role as Role],
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Your slice of the workforce hierarchy — {team.users.length} member
            {team.users.length > 1 ? 's' : ''} visible.
          </p>
        </div>
        {hasCapability(me.role, 'manage_users') && (
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
                  {ROLE_LABELS[me.role]}). New members sign in with the demo
                  password until invites land.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role *</Label>
                    <Select
                      value={form.role}
                      onValueChange={(v) =>
                        setForm({ ...form, role: v as Role, managerId: '' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {creatable.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reports to *</Label>
                    <Select
                      value={form.managerId}
                      onValueChange={(v) => setForm({ ...form, managerId: v })}
                    >
                      <SelectTrigger disabled={!form.role}>
                        <SelectValue
                          placeholder={
                            form.role ? 'Select manager' : 'Pick role first'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {possibleManagers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} ({ROLE_LABELS[u.role as Role]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Region *</Label>
                    <Input
                      value={form.region}
                      onChange={(e) =>
                        setForm({ ...form, region: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Job title *</Label>
                    <Input
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={
                    !form.name.trim() ||
                    !form.email.trim() ||
                    !form.role ||
                    !form.managerId ||
                    !form.region.trim() ||
                    !form.title.trim() ||
                    addMember.isPending
                  }
                  onClick={() =>
                    addMember.mutate(form, {
                      onSuccess: (r) => {
                        // Email delivery failed: surface the link rather than
                        // leaving a member who can never sign in.
                        if (!r.inviteSent && r.inviteUrl) {
                          setInviteLink({
                            name: r.user.name,
                            url: r.inviteUrl,
                          });
                        }
                        setForm({
                          name: '',
                          email: '',
                          role: '',
                          managerId: '',
                          region: '',
                          title: '',
                        });
                        setOpen(false);
                      },
                    })
                  }
                >
                  Add member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Fallback when the invite email could not be sent. */}
        <Dialog
          open={!!inviteLink}
          onOpenChange={(o) => !o && setInviteLink(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send this link to {inviteLink?.name}</DialogTitle>
              <DialogDescription>
                The invite email could not be sent. This link lets them set
                their own password — it works once and expires in 72 hours.
                Send it privately.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                {inviteLink?.url}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (inviteLink) {
                    navigator.clipboard
                      .writeText(inviteLink.url)
                      .then(() => toast.success('Link copied'))
                      .catch(() => toast.error('Copy it manually'));
                  }
                }}
              >
                <Copy />
                Copy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
                      {ROLE_LABELS[m.role as Role]}
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
          {self && (
            <MemberNode
              user={self}
              users={team.users}
              targets={team.targets}
              currentUserId={me.id}
              depth={0}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
