import { logger } from './utils/logger.js';
import { eventBus } from './server/event-bus.js';
import { pollAllTargets } from './github/poller.js';
import {
  upsertPR, markPRClosed, listOpenPRs, getLatestReview,
  setExternalStage, setPendingApproval, listExternalPRsAwaitingCi, getLatestReviewByStage,
} from './state/models.js';
import { reviewPR, reviewExternalInitial, reviewExternalFinal } from './review/engine.js';
import { notifyReviewComplete } from './notifications/notifier.js';
import {
  isExternalContributor, getCIStatus, hasActionRequiredRuns, approveAllActionRequiredRuns,
} from './github/client.js';
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

// ---------------------------------------------------------------------------
// External contributor helpers
// ---------------------------------------------------------------------------

async function handleExternalInitial(
  pr: ReturnType<typeof listOpenPRs>[number],
  config: ConfigOutput,
): Promise<void> {
  const review = await reviewExternalInitial(pr.owner, pr.repo, pr.number, pr.id, config);

  notifyReviewComplete({
    owner: pr.owner, repo: pr.repo, number: pr.number,
    title: pr.title, category: review.category, summary: review.summary,
    url: pr.url, notificationsConfig: config.notifications,
  });

  if (review.category === 'block') {
    // Don't advance — leave stage null so it shows up as a blocked external PR
    logger.info({ owner: pr.owner, repo: pr.repo, number: pr.number }, 'External PR blocked at initial review');
    return;
  }

  setExternalStage(pr.id, 'awaiting_approval');
  logger.info({ owner: pr.owner, repo: pr.repo, number: pr.number }, 'External PR awaiting CI approval');
}

export async function approvePendingWorkflows(
  pr: ReturnType<typeof listOpenPRs>[number],
): Promise<void> {
  const count = await approveAllActionRequiredRuns(pr.owner, pr.repo, pr.head_sha);

  if (count === 0) {
    logger.warn({ owner: pr.owner, repo: pr.repo, number: pr.number }, 'No action_required workflow runs found');
  }

  setPendingApproval(pr.id, false);

  // Advance external PR stage if applicable
  if (pr.is_external && pr.external_stage === 'awaiting_approval') {
    setExternalStage(pr.id, 'ci_pending');
  }

  logger.info({ owner: pr.owner, repo: pr.repo, number: pr.number, count }, 'Approved pending workflows');
}

async function checkPendingApprovals(): Promise<void> {
  const openPRs = listOpenPRs();
  await Promise.all(openPRs.map(async (pr) => {
    try {
      const needs = await hasActionRequiredRuns(pr.owner, pr.repo, pr.head_sha);
      if (needs !== !!pr.pending_approval) {
        setPendingApproval(pr.id, needs);
        if (needs) {
          logger.info({ owner: pr.owner, repo: pr.repo, number: pr.number }, 'PR has action_required workflow runs');
          eventBus.emit('app', { type: 'approval:needed', prId: pr.id, owner: pr.owner, repo: pr.repo, number: pr.number });
        }
      }
    } catch (err) {
      logger.warn({ owner: pr.owner, repo: pr.repo, number: pr.number, err }, 'Failed to check workflow approval status');
    }
  }));
}

async function checkExternalCIPending(config: ConfigOutput): Promise<void> {
  const pending = listExternalPRsAwaitingCi();

  for (const pr of pending) {
    const ciStatus = await getCIStatus(pr.owner, pr.repo, pr.head_sha);

    if (ciStatus === 'pending' || ciStatus === 'no_runs') continue;

    logger.info({ owner: pr.owner, repo: pr.repo, number: pr.number, ciStatus }, 'CI finished, running final review');

    try {
      const review = await reviewExternalFinal(
        pr.owner, pr.repo, pr.number, pr.head_sha, pr.id, config,
      );

      notifyReviewComplete({
        owner: pr.owner, repo: pr.repo, number: pr.number,
        title: pr.title, category: review.category, summary: review.summary,
        url: pr.url, notificationsConfig: config.notifications,
      });

      setExternalStage(pr.id, 'complete');
    } catch (err) {
      logger.error({ owner: pr.owner, repo: pr.repo, number: pr.number, err }, 'External final review failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Main poll cycle
// ---------------------------------------------------------------------------

async function pollCycle(): Promise<void> {
  if (!_config) return;

  logger.info('Starting poll cycle');
  const startMs = Date.now();

  try {
    const discovered = await pollAllTargets(_config.targets);
    logger.info({ count: discovered.length }, 'Discovered open PRs');

    const discoveredKeys = new Set<string>();
    for (const pr of discovered) {
      const isExternal = _config.trustedOrgs.length > 0
        ? await isExternalContributor(pr.author, _config.trustedOrgs)
        : false;

      upsertPR({
        owner: pr.owner, repo: pr.repo, number: pr.number,
        title: pr.title, author: pr.author, body: pr.body ?? '',
        head_sha: pr.headSha, base_branch: pr.baseBranch, state: pr.state,
        url: pr.url, created_at: pr.createdAt, updated_at: pr.updatedAt,
        is_external: isExternal ? 1 : 0,
        external_stage: null,   // preserved via ON CONFLICT; only set on new rows
        pending_approval: 0,    // preserved via ON CONFLICT; only set via setPendingApproval()
      });
      discoveredKeys.add(`${pr.owner}/${pr.repo}#${pr.number}`);
    }

    // Mark closed
    const stored = listOpenPRs();
    for (const p of stored) {
      if (!discoveredKeys.has(`${p.owner}/${p.repo}#${p.number}`)) {
        markPRClosed(p.owner, p.repo, p.number);
        logger.info({ owner: p.owner, repo: p.repo, number: p.number }, 'Marked PR closed');
      }
    }

    // Detect action_required workflow runs on all open PRs
    await checkPendingApprovals();

    // Check CI completion for external PRs already approved
    await checkExternalCIPending(_config);

    // Queue reviews for PRs that need them
    const prsNeedingReview = listOpenPRs().filter((pr) => {
      if (pr.is_external) {
        // External: needs initial review if no review exists yet and not blocked/complete
        const review = getLatestReview(pr.id);
        return !review && pr.external_stage == null;
      }
      // Internal: re-review if SHA changed
      const review = getLatestReview(pr.id);
      return !review || review.head_sha !== pr.head_sha;
    });

    if (prsNeedingReview.length > 0) {
      logger.info({ count: prsNeedingReview.length }, 'Queuing reviews');
      let idx = 0;

      async function runNext(): Promise<void> {
        while (idx < prsNeedingReview.length) {
          const pr = prsNeedingReview[idx++];
          if (!pr || !_config) continue;
          try {
            if (pr.is_external) {
              await handleExternalInitial(pr, _config);
            } else {
              const { review } = await reviewPR(pr.owner, pr.repo, pr.number, _config);
              notifyReviewComplete({
                owner: pr.owner, repo: pr.repo, number: pr.number,
                title: pr.title, category: review.category, summary: review.summary,
                url: pr.url, notificationsConfig: _config.notifications,
              });
              eventBus.emit('app', { type: 'review:complete', prId: pr.id, owner: pr.owner, repo: pr.repo, number: pr.number, category: review.category });
            }
          } catch (err) {
            logger.error({ owner: pr.owner, repo: pr.repo, number: pr.number, err }, 'Review failed');
          }
        }
      }

      await Promise.all(new Array(_config.maxConcurrentReviews).fill(null).map(() => runNext()));
    }

    state.lastPollAt = new Date();
    state.pollCount++;
    logger.info({ durationMs: Date.now() - startMs }, 'Poll cycle complete');
    eventBus.emit('app', { type: 'poll:complete', pollCount: state.pollCount, prCount: discoveredKeys.size });
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
    { pollIntervalSeconds: config.pollIntervalSeconds, targets: config.targets.length, trustedOrgs: config.trustedOrgs },
    'Daemon starting',
  );
  await pollCycle();
  scheduleNext();
}

export function stopDaemon(): void {
  state.running = false;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  logger.info('Daemon stopped');
}

export function getDaemonState(): DaemonState {
  return { ...state };
}

export async function triggerPoll(): Promise<void> {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  await pollCycle();
  scheduleNext();
}
