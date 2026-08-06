'use client';

// First-run checklist: teaches the core loop per role, auto-checks off as
// real data appears, dismissible per user. Shown on the dashboard until
// complete or dismissed.

import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { hasCapability } from '@/lib/policy';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface Step {
  label: string;
  done: boolean;
  href: string;
}

export function OnboardingChecklist() {
  const { state, currentUser, dismissOnboarding } = useStore();
  if (!currentUser) return null;
  if (state.onboardingDismissed[currentUser.id]) return null;

  const mine = {
    leads: state.leads.filter((l) => l.ownerId === currentUser.id),
    activities: state.salesActivities.filter(
      (a) => a.ownerId === currentUser.id,
    ),
    deals: state.deals.filter((d) => d.ownerId === currentUser.id),
  };

  const isAdmin = hasCapability(currentUser.role, 'view_admin');

  const steps: Step[] = isAdmin
    ? [
        {
          label: 'Review monthly targets',
          done: Object.keys(state.targets).length > 0,
          href: '/admin',
        },
        {
          label: 'Check the product catalogue',
          done: state.products.length > 0,
          href: '/admin',
        },
        {
          label: 'Set your organisation details for quotations',
          done: !!state.orgSettings.companyName,
          href: '/admin',
        },
        {
          label: 'Review the team hierarchy',
          done: state.users.length > 1,
          href: '/team',
        },
      ]
    : [
        {
          label: 'Capture your first lead',
          done: mine.leads.length > 0,
          href: '/leads',
        },
        {
          label: 'Log a call or schedule a follow-up',
          done: mine.activities.length > 0,
          href: '/activities',
        },
        {
          label: 'Convert a qualified lead into a deal',
          done: mine.leads.some((l) => l.status === 'converted'),
          href: '/leads',
        },
        {
          label: 'Secure your first order',
          done: mine.deals.some((d) => d.stage === 'won'),
          href: '/pipeline',
        },
      ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

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
            onClick={dismissOnboarding}
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
