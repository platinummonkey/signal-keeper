import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { configSchema, type ConfigOutput } from './schema.js';
import { paths } from '../utils/paths.js';
import type { Target } from './types.js';

const DEFAULT_CONFIG_YAML = `# PR Auto-Reviewer configuration
# See https://github.com/platinummonkey/pr-auto-reviewer for docs

github:
  tokenCommand: "gh auth token"

pollIntervalSeconds: 300

targets:
  # Monitor all PRs in a GitHub org
  # - org: my-company
  #   filter: team
  #
  # Monitor a specific repo
  # - repo: owner/repo-name
  #   filter: all

notifications:
  enabled: true
  categories: [needs-attention, needs-changes, block]

maxConcurrentReviews: 3
maxReviewCostUsd: 0.50
reviewModel: sonnet
workDir: ~/.pr-auto-reviewer/repos
`;

function expandHome(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export function loadConfig(configPath?: string): ConfigOutput {
  const filePath = configPath ?? paths.configFile;

  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, DEFAULT_CONFIG_YAML, 'utf8');
    console.log(`Created config template at ${filePath}\nAdd at least one target, then re-run.`);
    process.exit(0);
  }

  const raw = readFileSync(filePath, 'utf8');
  const parsed = parse(raw);

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Config validation failed:\n${issues}`);
  }

  const config = result.data;

  if (config.targets.length === 0) {
    throw new Error(
      `No targets configured in ${filePath}\nAdd at least one "org:" or "repo:" entry under "targets:".`,
    );
  }

  config.workDir = expandHome(config.workDir);
  return config;
}

export function addTarget(target: Target, configPath?: string): void {
  const filePath = configPath ?? paths.configFile;

  // Ensure config file exists (writes template if not)
  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, DEFAULT_CONFIG_YAML, 'utf8');
  }

  const raw = readFileSync(filePath, 'utf8');
  const parsed = parse(raw) ?? {};

  if (!Array.isArray(parsed.targets)) {
    parsed.targets = [];
  }

  // Check for duplicate
  const isDuplicate = parsed.targets.some((t: Record<string, unknown>) => {
    if ('repo' in target && 'repo' in t) return t.repo === target.repo;
    if ('org' in target && 'org' in t) return t.org === target.org;
    return false;
  });

  if (isDuplicate) {
    const label = 'repo' in target ? target.repo : target.org;
    throw new Error(`${label} is already in your targets`);
  }

  parsed.targets.push(target);
  writeFileSync(filePath, stringify(parsed, { lineWidth: 0 }), 'utf8');
}
