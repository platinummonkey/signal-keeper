import { homedir } from 'os';
import { join } from 'path';

const BASE_DIR = join(homedir(), '.pr-auto-reviewer');

export const paths = {
  baseDir: BASE_DIR,
  configFile: join(BASE_DIR, 'config.yaml'),
  dbFile: join(BASE_DIR, 'state.db'),
  logsDir: join(BASE_DIR, 'logs'),
  reposDir: join(BASE_DIR, 'repos'),
};
