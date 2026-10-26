export const CRON_JOBS = [
  { id: 'outbox-drain', schedule: '0 0 * * *' },
  { id: 'leaderboard-snapshot', schedule: '0 2 * * *' },
  { id: 'shelf-recommendations', schedule: '0 3 * * *' },
  { id: 'similar-books', schedule: '0 4 * * *' },
  { id: 'generate-prompts', schedule: '0 6 * * *' },
  { id: 'ai-writing-plans', schedule: '0 7 * * *' },
  { id: 'new-release-alerts', schedule: '0 8 * * *' },
  { id: 'reading-goal-milestones', schedule: '0 9 * * *' },
  { id: 'account-hardening', schedule: '0 10 * * *' },
  { id: 'email-digest', schedule: '0 11 * * *' },
  { id: 'taste-profiles', schedule: '0 1 * * 0' },
  { id: 'affiliate-health', schedule: null },
] as const;
export type CronJobId = typeof CRON_JOBS[number]['id'];

export const INTEGRITY_SIGNALS = ['tipsWithoutPayout','tipsWithoutOutbox','payoutsWithoutAudit','failedOutbox','stalledOutbox','uncertainDigests','unacknowledgedPurchases','stalledBillingDeliveries'] as const;
