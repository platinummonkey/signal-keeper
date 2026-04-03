import express from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { createApiRouter } from './api.js';
import { eventBus } from './event-bus.js';
import { notBuiltPage } from './ui.js';
import { getDaemonState } from '../daemon.js';
import { logger } from '../utils/logger.js';
import type { ConfigOutput } from '../config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, 'client');

export function startServer(config: ConfigOutput, devMode = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express();

    // Only allow localhost connections
    app.use((_req, res, next) => {
      const host = _req.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
        return res.status(403).send('Forbidden');
      }
      next();
    });

    // In dev mode allow Vite dev server (port 5173) to call the API cross-origin
    if (devMode) {
      app.use((_req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        next();
      });
    }

    app.use(express.json());

    // Daemon status
    app.get('/api/status', (_req: Request, res: Response) => {
      const state = getDaemonState();
      res.json({ running: state.running, lastPollAt: state.lastPollAt, pollCount: state.pollCount });
    });

    // SSE — push live events to browser
    app.get('/api/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
      const onEvent = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      eventBus.on('app', onEvent);
      req.on('close', () => { clearInterval(heartbeat); eventBus.off('app', onEvent); });
    });

    // API routes
    app.use('/api', createApiRouter(config));

    if (!devMode) {
      // Production: serve built client from dist/client/
      if (existsSync(CLIENT_DIST)) {
        app.use(express.static(CLIENT_DIST));
        // SPA fallback — serve index.html for any non-API route
        app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
      } else {
        app.get('*', (_req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(notBuiltPage(config.port));
        });
      }
    }

    const server = app.listen(config.port, '127.0.0.1', () => {
      logger.info({ port: config.port, devMode }, 'Server started');
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
