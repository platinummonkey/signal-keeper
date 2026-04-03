import pino from 'pino';
import { join } from 'path';
import { paths } from './paths.js';

let _logger: pino.Logger | null = null;

export function initLogger(opts: { pretty?: boolean; level?: string } = {}) {
  const { pretty = false, level = 'info' } = opts;

  const transport = pretty
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
    : pino.transport({
        targets: [
          {
            target: 'pino/file',
            options: { destination: join(paths.logsDir, 'daemon.log'), mkdir: true },
          },
        ],
      });

  _logger = pino({ level }, transport);
  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = pino({ level: 'info' });
  }
  return _logger;
}

export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    return (getLogger() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
