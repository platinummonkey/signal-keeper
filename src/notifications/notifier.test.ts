import { describe, it, expect, vi } from 'vitest';
import { notifyReviewComplete } from './notifier.js';

vi.mock('node-notifier', () => ({
  default: { notify: vi.fn() },
}));

import notifier from 'node-notifier';

const BASE = {
  owner: 'acme', repo: 'widget', number: 1,
  title: 'Fix bug', summary: 'Clean fix.',
  url: 'https://github.com/acme/widget/pull/1',
};

const ALL_CATEGORIES_CONFIG = {
  enabled: true,
  categories: ['auto-merge', 'needs-attention', 'needs-changes', 'block'] as const,
};

describe('notifyReviewComplete', () => {
  it('calls notifier.notify for a matching category', () => {
    vi.mocked(notifier.notify).mockClear();
    notifyReviewComplete({ ...BASE, category: 'block', notificationsConfig: ALL_CATEGORIES_CONFIG });
    expect(notifier.notify).toHaveBeenCalledOnce();
  });

  it('does not notify when notifications are disabled', () => {
    vi.mocked(notifier.notify).mockClear();
    notifyReviewComplete({
      ...BASE, category: 'block',
      notificationsConfig: { enabled: false, categories: ['block'] },
    });
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('does not notify for categories not in the list', () => {
    vi.mocked(notifier.notify).mockClear();
    notifyReviewComplete({
      ...BASE, category: 'auto-merge',
      notificationsConfig: { enabled: true, categories: ['block'] },
    });
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('includes the PR URL in the notification', () => {
    vi.mocked(notifier.notify).mockClear();
    notifyReviewComplete({ ...BASE, category: 'needs-changes', notificationsConfig: ALL_CATEGORIES_CONFIG });
    const call = vi.mocked(notifier.notify).mock.calls[0][0] as Record<string, unknown>;
    expect(call.open).toBe(BASE.url);
  });
});
