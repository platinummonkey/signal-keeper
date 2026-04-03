import notifier from 'node-notifier';
import { logger } from '../utils/logger.js';
import type { ReviewCategory } from '../review/types.js';
import type { NotificationsConfig } from '../config/types.js';

export function notify(opts: {
  title: string;
  message: string;
  category: ReviewCategory;
  prUrl: string;
  notificationsConfig: NotificationsConfig;
}): void {
  const { title, message, category, prUrl, notificationsConfig } = opts;

  if (!notificationsConfig.enabled) return;
  if (!notificationsConfig.categories.includes(category)) return;

  const icon: Record<ReviewCategory, string> = {
    'auto-merge': '✅',
    'needs-attention': '👀',
    'needs-changes': '⚠️',
    'block': '🚫',
  };

  try {
    notifier.notify({
      title: `${icon[category]} ${title}`,
      message,
      open: prUrl,
      sound: category === 'block' || category === 'needs-changes',
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to send notification');
  }
}

export function notifyReviewComplete(opts: {
  owner: string;
  repo: string;
  number: number;
  title: string;
  category: ReviewCategory;
  summary: string;
  url: string;
  notificationsConfig: NotificationsConfig;
}): void {
  notify({
    title: `${opts.owner}/${opts.repo}#${opts.number}`,
    message: `[${opts.category}] ${opts.title}\n${opts.summary.slice(0, 100)}`,
    category: opts.category,
    prUrl: opts.url,
    notificationsConfig: opts.notificationsConfig,
  });
}
