/**
 * In-memory ring buffer for recent daemon log lines, fed by a custom pino
 * write stream. Provides live SSE streaming to the browser log overlay.
 */
import { Writable } from 'stream';

const MAX_LINES = 500;

export interface LogLine {
  ts: string;
  level: string;
  msg: string;
  raw: string;
}

const lines: LogLine[] = [];
const subscribers = new Set<(line: LogLine) => void>();

function parseLevel(n: number): string {
  if (n >= 50) return 'error';
  if (n >= 40) return 'warn';
  if (n >= 30) return 'info';
  return 'debug';
}

function push(raw: string): void {
  raw = raw.trim();
  if (!raw) return;
  let parsed: LogLine;
  try {
    const j = JSON.parse(raw) as { time?: number; level?: number; msg?: string };
    parsed = {
      ts: j.time ? new Date(j.time).toISOString() : new Date().toISOString(),
      level: parseLevel(j.level ?? 30),
      msg: j.msg ?? raw,
      raw,
    };
  } catch {
    parsed = { ts: new Date().toISOString(), level: 'info', msg: raw, raw };
  }
  if (lines.length >= MAX_LINES) lines.shift();
  lines.push(parsed);
  subscribers.forEach(cb => cb(parsed));
}

export const logBuffer = {
  getAll: () => [...lines],
  subscribe(cb: (line: LogLine) => void): () => void {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  },
  /** pino-compatible Writable stream — pass as pino destination */
  createStream(): Writable {
    return new Writable({
      write(chunk: Buffer, _enc, done) {
        chunk.toString().split('\n').forEach(push);
        done();
      },
    });
  },
};
