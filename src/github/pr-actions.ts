import { createComment, mergePR, closePR } from './client.js';
import { recordDecision } from '../state/models.js';
import { logger } from '../utils/logger.js';

export async function actionMerge(prId: number, owner: string, repo: string, number: number, sha: string): Promise<void> {
  await mergePR(owner, repo, number, sha);
  recordDecision({ pr_id: prId, action: 'merged' });
}

export async function actionComment(prId: number, owner: string, repo: string, number: number, body: string): Promise<void> {
  await createComment(owner, repo, number, body);
  recordDecision({ pr_id: prId, action: 'commented', note: body.slice(0, 200) });
}

export async function actionClose(prId: number, owner: string, repo: string, number: number): Promise<void> {
  await closePR(owner, repo, number);
  recordDecision({ pr_id: prId, action: 'closed' });
}
