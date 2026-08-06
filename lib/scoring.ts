// Rule-based lead scoring: tells the rep who to call first. Transparent
// heuristics (no black box) — source quality + deal size + freshness +
// engagement + qualification progress, clamped to 0–100.

import { Lead, LeadSource } from './types';

const SOURCE_POINTS: Record<LeadSource, number> = {
  referral: 25,
  field_visit: 22,
  event: 20,
  walk_in: 18,
  phone: 16,
  website: 14,
  marketplace: 10,
  email_campaign: 10,
  social_media: 8,
};

export function leadScore(lead: Lead, activityCount: number): number {
  let score = SOURCE_POINTS[lead.source] ?? 10;

  // Deal size
  if (lead.estimatedValue >= 500000) score += 25;
  else if (lead.estimatedValue >= 250000) score += 18;
  else if (lead.estimatedValue >= 100000) score += 12;
  else if (lead.estimatedValue > 0) score += 6;

  // Freshness of last touch
  const days =
    (Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 2) score += 20;
  else if (days <= 7) score += 12;
  else if (days <= 14) score += 6;

  // Engagement logged against the lead
  score += Math.min(activityCount * 5, 15);

  // Qualification progress
  if (lead.status === 'qualified') score += 15;
  else if (lead.status === 'contacted') score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreTier(score: number): {
  label: 'Hot' | 'Warm' | 'Cold';
  className: string;
} {
  if (score >= 70)
    return {
      label: 'Hot',
      className:
        'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    };
  if (score >= 45)
    return {
      label: 'Warm',
      className:
        'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    };
  return {
    label: 'Cold',
    className:
      'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  };
}
