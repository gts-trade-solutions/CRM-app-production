'use client';

// First-run checklist — API-backed, auto-checks off as real data appears.
// Dismissal is a UI preference and stays in localStorage per user.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import {
  useDashboardStats,
  useProducts,
  useSettings,
  useTeam,
} from '@/lib/api/crm-hooks';
import { useActivities, useMe } from '@/lib/api/hooks';
import { hasCapability } from '@/lib/policy';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface Step {
  label: string;
  done: boolean;
  href: string;
}

const DISMISS_KEY = 'sf-onboarding-dismissed';

export function OnboardingChecklist() {
  const { data: me } = useMe();
  const { data: stats } = useDashboardStats();
  const { data: myActivities } = useActivities({ scope: 'mine' });
  const isAdmin = me ? hasCapability(me.role, 'view_admin') : false;
  const { data: products } = useProducts();
  const { data: settings } = useSettings();
  const { data: team } = useTeam();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!me) return;
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      setDismissed(!!map[me.id]);
    } catch {
      setDismissed(false);
    }
  }, [me]);

  if (!me || dismissed || !stats) return null;

  const steps: Step[] = isAdmin
    ? [
        {
          label: 'Review monthly targets',
          done: Object.keys(team?.targets ?? {}).length > 0,
          href: '/admin',
        },
        {
          label: 'Check the product catalogue',
          done: (products ?? []).length > 0,
          href: '/admin',
        },
        {
          label: 'Set your organisation details for quotations',
          done: !!settings?.org?.companyName,
          href: '/admin',
        },
        {
          label: 'Review the team hierarchy',
          done: (team?.users ?? []).length > 1,
          href: '/team',
        },
      ]
    : [
        {
          label: 'Capture your first lead',
          done: stats.leads.total > 0,
          href: '/leads',
        },
        {
          label: 'Log a call or schedule a follow-up',
          done: (myActivities ?? []).length > 0,
          href: '/activities',
        },
        {
          label: 'Convert a qualified lead into a deal',
          done: stats.leads.converted > 0,
          href: '/leads',
        },
        {
          label: 'Secure your first order',
          done: stats.pipeline.securedCount > 0,
          href: '/pipeline',
        },
      ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  function dismiss() {
    if (!me) return;
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      map[me.id] = true;
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
    } catch {
      // storage unavailable — dismiss for the session only
    }
    setDismissed(true);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              Getting started ({doneCount}/{steps.length})
            </p>
            <p className="text-sm text-muted-foreground">
              The core loop — each step checks itself off as you go.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss checklist"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.label}>
              <Link
                href={step.href}
                className={cn(
                  'flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent',
                  step.done && 'opacity-70',
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn(step.done && 'line-through')}>
                  {step.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
