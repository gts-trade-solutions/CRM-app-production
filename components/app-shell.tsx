'use client';

// Authenticated app chrome: sidebar navigation + topbar. Client-side auth
// guard — redirects to /login when no user is selected.

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  CloudOff,
  Contact,
  Kanban,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Moon,
  Network,
  RotateCcw,
  Settings2,
  Sun,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { GlobalSearch } from '@/components/global-search';
import { NotificationsMenu } from '@/components/notifications-menu';
import { Capability, hasCapability } from '@/lib/policy';
import { useTheme } from 'next-themes';
import { signOut } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { ROLE_LABELS } from '@/lib/types';
import { cn, initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  capability?: Capability;
}

// Grouped, role-aware navigation — items render only when the policy
// matrix grants the capability.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Work',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/activities', label: 'My Day', icon: CalendarCheck },
      { href: '/leads', label: 'Leads', icon: UserPlus },
      { href: '/contacts', label: 'Contacts', icon: Contact },
      { href: '/accounts', label: 'Accounts', icon: Briefcase },
      { href: '/pipeline', label: 'Pipeline', icon: Kanban },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, capability: 'view_campaigns' },
      { href: '/reports', label: 'Reports', icon: BarChart3, capability: 'view_reports' },
    ],
  },
  {
    title: 'Management',
    items: [
      { href: '/team', label: 'Team', icon: Network, capability: 'view_team' },
      { href: '/admin', label: 'Admin', icon: Settings2, capability: 'view_admin' },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { hydrated, currentUser, online, state, logout, resetDemo } =
    useStore();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (hydrated && !currentUser) {
      router.replace('/login');
    }
  }, [hydrated, currentUser, router]);

  if (!hydrated || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const pendingCount = state.leads.filter((l) => l.pendingSync).length;

  // Follow-ups needing attention today — surfaces on the My Day nav item
  // so a rep sees their workload from anywhere in the app.
  const now = new Date();
  const dueCount = state.salesActivities.filter(
    (a) =>
      a.ownerId === currentUser.id &&
      a.kind !== 'note' &&
      !a.completedAt &&
      a.dueAt &&
      new Date(a.dueAt).getTime() <=
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
  ).length;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-semibold">SalesForce</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (i) => !i.capability || hasCapability(currentUser.role, i.capability),
            );
            if (items.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {items.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                        {item.href === '/activities' && dueCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                            {dueCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t p-4 text-xs text-muted-foreground">
          Signed in as{' '}
          <span className="font-medium text-foreground">
            {ROLE_LABELS[currentUser.role]}
          </span>
          <br />
          Visibility: own records + everyone below you.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </div>
          </div>

          <GlobalSearch />
          <div className="flex-1" />

          {/* Connectivity indicator drives the offline-lead story */}
          <Badge
            variant={online ? 'secondary' : 'destructive'}
            className="hidden gap-1.5 sm:inline-flex"
          >
            {online ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {online ? 'Online' : 'Offline'}
          </Badge>
          {pendingCount > 0 && (
            <Badge variant="outline" className="gap-1.5">
              <CloudOff className="h-3 w-3" />
              {pendingCount} pending sync
            </Badge>
          )}

          <NotificationsMenu />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full outline-none ring-ring focus-visible:ring-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials(currentUser.name)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p>{currentUser.name}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  {currentUser.title}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetDemo}>
                <RotateCcw />
                Reset demo data
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  // End the NextAuth session and the mock-store identity.
                  await signOut({ redirect: false });
                  logout();
                  router.replace('/login');
                }}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Mobile nav */}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {NAV_GROUPS.flatMap((g) => g.items)
            .filter(
              (i) =>
                !i.capability || hasCapability(currentUser.role, i.capability),
            )
            .map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
        </nav>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
