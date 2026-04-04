import { run } from '../utils/process.js';
import { logger } from '../utils/logger.js';
import type { Review } from '../state/models.js';

export interface FixRunnerResult {
  changed: boolean;
  costUsd?: number;
}

export async function runClaudeCIFix(
  repoDir: string,
  jobName: string,
  opts: { model?: string; maxBudgetUsd?: number; onLog?: (line: string) => void } = {},
): Promise<FixRunnerResult> {
  const { model = 'sonnet', maxBudgetUsd = 10.0, onLog } = opts;

  const prompt = `You are fixing a CI/CD failure in a GitHub Pull Request.

The failing CI job is: **${jobName}**

Based on the job name, understand what it checks (tests, linting, type-checking, build, etc.).
Explore the codebase, find what is causing this job to fail, and apply the minimal fix.

Rules:
- Only change what is necessary to fix the failing job
- Do not refactor or change unrelated code
- Use Read to understand the code, Edit to fix it, Bash to run checks if needed
- After fixing, briefly summarise what you changed and why`;

  // Pass the prompt via stdin — explicit "through stdin" mode avoids any
  // positional-argument parsing ambiguity with --add-dir consuming extra args.
  const args = [
    '--print',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--tools', 'Bash,Edit,Read',
    '--model', model,
    '--max-budget-usd', String(maxBudgetUsd),
    '--add-dir', repoDir,
  ];

  logger.info({ repoDir, jobName }, 'Running Claude CI fix');

  const result = await run('claude', args, { cwd: repoDir, timeout: 600_000, input: prompt, onOutput: onLog } as Parameters<typeof run>[2]);

  if (result.exitCode !== 0) {
    throw new Error(`claude CI fix exited ${result.exitCode}: ${result.stderr.slice(0, 300)}`);
  }

  let costUsd: number | undefined;
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    if (typeof parsed.total_cost_usd === 'number') costUsd = parsed.total_cost_usd;
  } catch { /* non-critical */ }

  return { changed: true, costUsd };
}

export async function runClaudeFix(
  repoDir: string,
  review: Review,
  opts: { model?: string; maxBudgetUsd?: number } = {},
): Promise<FixRunnerResult> {
  const { model = 'sonnet', maxBudgetUsd = 1.0 } = opts;

  const changeList = review.suggested_changes
    .map((sc, i) => `${i + 1}. ${sc.file}: ${sc.description}\n   ${sc.suggestion}`)
    .join('\n\n');

  const notesSection = review.notes.length > 0
    ? `\nThe reviewer also noted:\n${review.notes.map((n) => `- ${n}`).join('\n')}`
    : '';

  const prompt = `You are an automated code fixer. Apply the following changes to this codebase.

## Review Summary
${review.summary}
${notesSection}

## Requested Changes
${changeList || 'Address the issues mentioned in the review summary.'}

Apply these changes carefully and precisely. Do not add unrelated changes. Use the Edit and Read tools to make the changes.
After making all changes, respond with a brief summary of what you changed.`;

  logger.info({ repoDir, suggestedChanges: review.suggested_changes.length }, 'Running Claude autofix');

  const result = await run(
    'claude',
    [
      '--print',
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--tools', 'Bash,Edit,Read',
      '--model', model,
      '--max-budget-usd', String(maxBudgetUsd),
      '--add-dir', repoDir,
      prompt,
    ],
    { cwd: repoDir, timeout: 600_000 } as Parameters<typeof run>[2],
  );

  if (result.exitCode !== 0) {
    throw new Error(`claude autofix exited ${result.exitCode}: ${result.stderr.slice(0, 300)}`);
  }

  let costUsd: number | undefined;
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    if (typeof parsed.cost_usd === 'number') costUsd = parsed.cost_usd;
  } catch {
    // non-critical
  }

  return { changed: true, costUsd };
}
