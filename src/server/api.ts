import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import {
  listOpenPRs, getPR, getLatestReview, getLatestDecision,
} from '../state/models.js';
import { actionMerge, actionComment, actionClose } from '../github/pr-actions.js';
import { reviewPR, generateCommentFromReview } from '../review/engine.js';
import { fetchPRDiff, fetchPRFiles, getCIStatus, getWorkflowRunsForCommit, getWorkflowRunJobs } from '../github/client.js';
import { approvePendingWorkflows } from '../daemon.js';
import { runAutofix } from '../autofix/index.js';
import { logger } from '../utils/logger.js';
import type { ConfigOutput } from '../config/schema.js';

export function createApiRouter(config: ConfigOutput): Router {
  const router = createRouter();

  // List all open PRs with their latest review
  router.get('/prs', (_req: Request, res: Response) => {
    try {
      const prs = listOpenPRs();
      res.json(prs);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // CI status — fetched live (registered before :id to be explicit)
  router.get('/prs/:id/ci', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      const [status, runs] = await Promise.all([
        getCIStatus(pr.owner, pr.repo, pr.head_sha),
        getWorkflowRunsForCommit(pr.owner, pr.repo, pr.head_sha),
      ]);
      // Fetch jobs for each run in parallel
      const runsWithJobs = await Promise.all(
        runs.map(async (run) => ({
          ...run,
          jobs: await getWorkflowRunJobs(pr.owner, pr.repo, run.id),
        })),
      );
      res.json({ status, runs: runsWithJobs });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Diff — fetched live
  router.get('/prs/:id/diff', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      const [diff, files] = await Promise.all([
        fetchPRDiff(pr.owner, pr.repo, pr.number),
        fetchPRFiles(pr.owner, pr.repo, pr.number),
      ]);
      res.json({ diff, files });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Single PR detail
  router.get('/prs/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const prs = listOpenPRs() as ReturnType<typeof listOpenPRs>;
      const pr = prs.find((p) => p.id === id);
      if (!pr) return res.status(404).json({ error: 'PR not found' });

      const review = getLatestReview(id);
      const decision = getLatestDecision(id);
      res.json({ ...pr, latest_review: review ?? null, latest_decision: decision ?? null });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Merge
  router.post('/prs/:id/merge', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      await actionMerge(pr.id, pr.owner, pr.repo, pr.number, pr.head_sha);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'Merge failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Comment
  router.post('/prs/:id/comment', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      const body: string = req.body?.body;
      if (!body?.trim()) return res.status(400).json({ error: 'body is required' });
      await actionComment(pr.id, pr.owner, pr.repo, pr.number, body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Close
  router.post('/prs/:id/close', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      await actionClose(pr.id, pr.owner, pr.repo, pr.number);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Re-review
  router.post('/prs/:id/review', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      const customPrompt: string | undefined = req.body?.prompt || undefined;
      // Run async, return immediately
      reviewPR(pr.owner, pr.repo, pr.number, config, customPrompt)
        .catch((err) => logger.error({ err, prId: pr.id }, 'Re-review failed'));
      res.json({ ok: true, message: 'Review queued' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Approve CI workflows
  router.post('/prs/:id/approve-ci', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      await approvePendingWorkflows(pr);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Generate AI comment
  router.post('/prs/:id/generate-comment', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      const instruction: string = req.body?.instruction || 'Summarise the review findings for the author, focusing on what needs to change and why.';
      const result = await generateCommentFromReview(pr.id, instruction, config);
      await actionComment(pr.id, pr.owner, pr.repo, pr.number, result.body);
      res.json({ ok: true, body: result.body });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Autofix
  router.post('/prs/:id/autofix', async (req: Request, res: Response) => {
    try {
      const pr = requirePR(req, res); if (!pr) return;
      runAutofix(pr, config)
        .catch((err) => logger.error({ err, prId: pr.id }, 'Autofix failed'));
      res.json({ ok: true, message: 'Autofix started' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });


  return router;
}

function requirePR(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10);
  const prs = listOpenPRs();
  const pr = prs.find((p) => p.id === id);
  if (!pr) { res.status(404).json({ error: 'PR not found' }); return null; }
  return pr;
}
