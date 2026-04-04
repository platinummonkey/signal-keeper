import { randomUUID } from 'crypto';

export type FixSessionStatus = 'running' | 'done' | 'failed';

export interface FixSession {
  id: string;
  prId: number;
  owner: string;
  repo: string;
  prNumber: number;
  jobName: string;
  startedAt: Date;
  logs: string[];
  status: FixSessionStatus;
  followUpPrUrl: string | null;
}

type Subscriber = (line: string) => void;

class FixSessionManager {
  private sessions = new Map<string, FixSession>();
  private subscribers = new Map<string, Set<Subscriber>>();

  create(opts: Pick<FixSession, 'prId' | 'owner' | 'repo' | 'prNumber' | 'jobName'>): string {
    const id = randomUUID();
    this.sessions.set(id, { id, ...opts, startedAt: new Date(), logs: [], status: 'running', followUpPrUrl: null });
    this.subscribers.set(id, new Set());
    return id;
  }

  addLog(id: string, line: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.logs.push(line);
    this.subscribers.get(id)?.forEach(cb => cb(line));
  }

  setDone(id: string, followUpPrUrl: string | null): void {
    const session = this.sessions.get(id);
    if (session) { session.status = 'done'; session.followUpPrUrl = followUpPrUrl; }
    this.addLog(id, `\n✓ Complete${followUpPrUrl ? ` — ${followUpPrUrl}` : ''}`);
    this.subscribers.get(id)?.forEach(cb => cb('[done]'));
  }

  setFailed(id: string, error: string): void {
    const session = this.sessions.get(id);
    if (session) session.status = 'failed';
    this.addLog(id, `\n✗ Failed: ${error}`);
    this.subscribers.get(id)?.forEach(cb => cb('[done]'));
  }

  get(id: string): FixSession | undefined {
    return this.sessions.get(id);
  }

  subscribe(id: string, cb: Subscriber): () => void {
    this.subscribers.get(id)?.add(cb);
    return () => this.subscribers.get(id)?.delete(cb);
  }
}

export const fixSessions = new FixSessionManager();
