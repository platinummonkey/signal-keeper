import { logger } from './utils/logger.js';
import { pollAllTargets } from './github/poller.js';
import { upsertPR, markPRClosed, listOpenPRs, getLatestReview } from './state/models.js';
import { reviewPR } from './review/engine.js';
import { notifyReviewComplete } from './notifications/notifier.js';
import type { ConfigOutput } from './config/schema.js';

export interface DaemonState {
  running: boolean;
  lastPollAt: Date | null;
  pollCount: number;
}

const state: DaemonState = {
  running: false,
  lastPollAt: null,
  pollCount: 0,
};

let _config: ConfigOutput | null = null;
let _timer: ReturnType<typeof setTimeout> | null = null;

async function pollCycle(): Promise<void> {
  if (!_config) return;

  logger.info('Starting poll cycle');
  const startMs = Date.now();

  try {
    const discovered = await pollAllTargets(_config.targets);
    logger.info({ count: discovered.length }, 'Discovered open PRs');

    // Upsert all discovered PRs
    const discoveredKeys = new Set<string>();
    for (const pr of discovered) {
      upsertPR({
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        head_sha: pr.headSha,
        base_branch: pr.baseBranch,
        state: pr.state,
        url: pr.url,
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
      });
      discoveredKeys.add(`${pr.owner}/${pr.repo}#${pr.number}`);
    }

    // Mark PRs no longer returned as closed
    const stored = listOpenPRs();
    for (const p of stored) {
      const key = `${p.owner}/${p.repo}#${p.number}`;
      if (!discoveredKeys.has(key)) {
        markPRClosed(p.owner, p.repo, p.number);
        logger.info({ key }, 'Marked PR closed (no longer open on GitHub)');
      }
    }

    // Queue reviews for PRs that need them (new or updated SHA, no existing review)
    const prsNeedingReview = listOpenPRs().filter((pr) => {
      const review = getLatestReview(pr.id);
      return !review || review.head_sha !== pr.head_sha;
    });

    if (prsNeedingReview.length > 0) {
      logger.info({ count: prsNeedingReview.length }, 'Queuing reviews');
      const semaphore = new Array(_config.maxConcurrentReviews).fill(null);
      let idx = 0;

      async function runNext(): Promise<void> {
        while (idx < prsNeedingReview.length) {
          const pr = prsNeedingReview[idx++];
          if (!pr || !_config) continue;
          try {
            const { review } = await reviewPR(pr.owner, pr.repo, pr.number, _config);
            notifyReviewComplete({
              owner: pr.owner,
              repo: pr.repo,
              number: pr.number,
              title: pr.title,
              category: review.category,
              summary: review.summary,
              url: pr.url,
              notificationsConfig: _config.notifications,
            });
          } catch (err) {
            logger.error({ owner: pr.owner, repo: pr.repo, number: pr.number, err }, 'Review failed');
          }
        }
      }

      await Promise.all(semaphore.map(() => runNext()));
    }

    state.lastPollAt = new Date();
    state.pollCount++;
    logger.info({ durationMs: Date.now() - startMs }, 'Poll cycle complete');
  } catch (err) {
    logger.error({ err }, 'Poll cycle failed');
  }
}

function scheduleNext(): void {
  if (!_config || !state.running) return;
  _timer = setTimeout(async () => {
    await pollCycle();
    scheduleNext();
  }, _config.pollIntervalSeconds * 1000);
}

export async function startDaemon(config: ConfigOutput): Promise<void> {
  _config = config;
  state.running = true;

  logger.info(
    { pollIntervalSeconds: config.pollIntervalSeconds, targets: config.targets.length },
    'Daemon starting',
  );

  // Run immediately, then schedule
  await pollCycle();
  scheduleNext();
}

export function stopDaemon(): void {
  state.running = false;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  logger.info('Daemon stopped');
}

export function getDaemonState(): DaemonState {
  return { ...state };
}

export async function triggerPoll(): Promise<void> {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  await pollCycle();
  scheduleNext();
}
