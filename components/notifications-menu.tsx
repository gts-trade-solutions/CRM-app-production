'use client';

// In-app notifications for the signed-in user: assignments, stage moves on
// their deals, and closed-won alerts for their reports.

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Bell } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function NotificationsMenu() {
  const { state, currentUser, markNotificationsRead } = useStore();
  const router = useRouter();
  if (!currentUser) return null;

  const mine = state.notifications
    .filter((n) => n.userId === currentUser.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
  const unread = mine.filter((n) => !n.read).length;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open && unread > 0) markNotificationsRead();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mine.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing yet.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {mine.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (n.href) router.push(n.href);
                }}
                className={cn(
                  'flex w-full gap-2 rounded-sm px-2 py-2 text-left text-sm',
                  !n.read && 'bg-primary/5',
                  n.href && 'cursor-pointer hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    n.read ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <div className="min-w-0">
                  <p className="leading-snug">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.at), { addSuffix: true })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
