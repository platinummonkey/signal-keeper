import { program } from 'commander';
import { mkdirSync } from 'fs';
import { initLogger, logger } from './utils/logger.js';
import { paths } from './utils/paths.js';
import { loadConfig, addTarget } from './config/loader.js';
import { initDb, getDb } from './state/database.js';
import { initOctokit } from './github/client.js';
import { startDaemon, stopDaemon } from './daemon.js';
import { startServer } from './server/server.js';
import { openUrl } from './utils/open-url.js';

program
  .name('pr-auto-reviewer')
  .description('AI-powered GitHub PR reviewer with browser UI')
  .version('0.1.0');

program
  .command('start')
  .description('Start the daemon and open the browser UI')
  .option('-c, --config <path>', 'Config file path')
  .option('--log-level <level>', 'Log level (default: info)', 'info')
  .option('--no-open', 'Do not automatically open the browser')
  .action(async (opts) => {
    mkdirSync(paths.baseDir, { recursive: true });
    initLogger({ pretty: false, level: opts.logLevel });

    let config;
    try {
      config = loadConfig(opts.config);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }

    initDb(paths.dbFile);

    try {
      await initOctokit(config.github.tokenCommand);
    } catch (err) {
      console.error(`GitHub auth failed: ${(err as Error).message}`);
      process.exit(1);
    }

    // Graceful shutdown
    function shutdown(signal: string) {
      logger.info({ signal }, 'Shutting down');
      stopDaemon();
      try { getDb().close(); } catch {}
      process.exit(0);
    }
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    // Start the web server first, then the daemon
    try {
      await startServer(config);
    } catch (err) {
      console.error(`Server failed to start: ${(err as Error).message}`);
      process.exit(1);
    }

    const url = `http://localhost:${config.port}`;
    console.log(`\n  PR Auto-Reviewer running at ${url}\n`);

    if (opts.open !== false) {
      openUrl(url);
    }

    // Daemon runs in the same process
    startDaemon(config).catch((err) => {
      logger.error({ err }, 'Daemon error');
    });

    // Keep process alive
    await new Promise(() => {});
  });

program
  .command('review <url>')
  .description('Manually review a PR by URL (prints JSON)')
  .option('-c, --config <path>', 'Config file path')
  .action(async (url: string, opts) => {
    mkdirSync(paths.baseDir, { recursive: true });
    initLogger({ pretty: true, level: 'info' });

    let config;
    try {
      config = loadConfig(opts.config);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }

    initDb(paths.dbFile);
    await initOctokit(config.github.tokenCommand);

    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      console.error('Invalid GitHub PR URL');
      process.exit(1);
    }
    const [, owner, repo, num] = match;

    const { reviewPR } = await import('./review/engine.js');
    const result = await reviewPR(owner, repo, parseInt(num, 10), config);
    console.log(JSON.stringify(result, null, 2));
  });

// ── add repo / add org ────────────────────────────────────────────
const add = program.command('add').description('Add a target to your config');

add
  .command('repo <owner/repo>')
  .description('Watch a specific repository')
  .option('-f, --filter <filter>', 'Filter: all | assigned | author', 'all')
  .option('-c, --config <path>', 'Config file path')
  .action((repo: string, opts) => {
    const valid = ['all', 'assigned', 'author'];
    if (!valid.includes(opts.filter)) {
      console.error(`Invalid filter "${opts.filter}". Choose from: ${valid.join(', ')}`);
      process.exit(1);
    }
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      console.error('Repo must be in "owner/name" format');
      process.exit(1);
    }
    try {
      addTarget({ repo, filter: opts.filter }, opts.config);
      console.log(`Added repo ${repo} (filter: ${opts.filter})`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

add
  .command('org <org>')
  .description('Watch all repos in an organization')
  .option('-f, --filter <filter>', 'Filter: all | team | assigned | author', 'all')
  .option('-t, --team <slug>', 'GitHub team slug (required when filter=team)')
  .option('-c, --config <path>', 'Config file path')
  .action((org: string, opts) => {
    const valid = ['all', 'team', 'assigned', 'author'];
    if (!valid.includes(opts.filter)) {
      console.error(`Invalid filter "${opts.filter}". Choose from: ${valid.join(', ')}`);
      process.exit(1);
    }
    if (opts.filter === 'team' && !opts.team) {
      console.error('--team <slug> is required when --filter=team');
      process.exit(1);
    }
    try {
      addTarget(
        opts.team ? { org, filter: opts.filter, team: opts.team } : { org, filter: opts.filter },
        opts.config,
      );
      const label = opts.team ? `${org} (team: ${opts.team})` : `${org} (filter: ${opts.filter})`;
      console.log(`Added org ${label}`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parse();
