import express from 'express';
import type { Request, Response } from 'express';
import { createApiRouter } from './api.js';
import { eventBus } from './event-bus.js';
import { renderUI } from './ui.js';
import { getDaemonState } from '../daemon.js';
import { logger } from '../utils/logger.js';
import type { ConfigOutput } from '../config/schema.js';

export function startServer(config: ConfigOutput): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express();

    // Only allow localhost connections
    app.use((req, res, next) => {
      const host = req.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
        return res.status(403).send('Forbidden');
      }
      next();
    });

    app.use(express.json());

    // Serve the SPA
    app.get('/', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderUI(config.port));
    });

    // Daemon status
    app.get('/api/status', (_req: Request, res: Response) => {
      const state = getDaemonState();
      res.json({
        running: state.running,
        lastPollAt: state.lastPollAt,
        pollCount: state.pollCount,
      });
    });

    // SSE endpoint — push live events to browser
    app.get('/api/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const send = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Send a heartbeat every 15s so the connection doesn't time out
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

      const onEvent = (event: unknown) => send(event);
      eventBus.on('app', onEvent);

      req.on('close', () => {
        clearInterval(heartbeat);
        eventBus.off('app', onEvent);
      });
    });

    // API routes
    app.use('/api', createApiRouter(config));

    const server = app.listen(config.port, '127.0.0.1', () => {
      logger.info({ port: config.port }, 'Web UI server started');
      resolve();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${config.port} is already in use. Set a different port in config.yaml.`));
      } else {
        reject(err);
      }
    });
  });
}
