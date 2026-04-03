import { run } from '../utils/process.js';
import { logger } from '../utils/logger.js';
import type { ReviewOutput } from './types.js';
import { REVIEW_JSON_SCHEMA } from './types.js';

export interface ClaudeResult {
  output: ReviewOutput;
  costUsd?: number;
  model?: string;
}

export async function runClaudeReview(
  prompt: string,
  opts: {
    model?: string;
    maxBudgetUsd?: number;
  } = {},
): Promise<ClaudeResult> {
  const { model = 'sonnet', maxBudgetUsd = 0.5 } = opts;

  const schemaJson = JSON.stringify(REVIEW_JSON_SCHEMA);

  const args = [
    '--print',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--tools', 'Read',
    '--model', model,
    '--max-budget-usd', String(maxBudgetUsd),
    '--json-schema', schemaJson,
    prompt,
  ];

  logger.debug({ model, maxBudgetUsd }, 'Spawning claude subprocess for review');

  const result = await run('claude', args, { timeout: 300_000 } as Parameters<typeof run>[2]);

  if (result.exitCode !== 0) {
    throw new Error(`claude exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Failed to parse claude JSON output: ${result.stdout.slice(0, 200)}`);
  }

  const output = extractReviewOutput(parsed);
  const costUsd = extractCost(parsed);
  const usedModel = extractModel(parsed);

  return { output, costUsd, model: usedModel };
}

function extractReviewOutput(parsed: unknown): ReviewOutput {
  // Claude --output-format json wraps the structured result
  // The JSON schema result is in the last assistant message content
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Claude output is not an object');
  }

  const p = parsed as Record<string, unknown>;

  // Try direct top-level (if --json-schema inlines the result)
  if ('category' in p) {
    return p as unknown as ReviewOutput;
  }

  // Try result field
  if ('result' in p && typeof p.result === 'object' && p.result !== null) {
    const r = p.result as Record<string, unknown>;
    if ('category' in r) return r as unknown as ReviewOutput;
  }

  // Try messages array (last assistant message)
  if ('messages' in p && Array.isArray(p.messages)) {
    for (let i = p.messages.length - 1; i >= 0; i--) {
      const msg = p.messages[i] as Record<string, unknown>;
      if (msg.role === 'assistant') {
        const content = msg.content;
        if (typeof content === 'string') {
          const inner = JSON.parse(content);
          if (typeof inner === 'object' && inner !== null && 'category' in inner) {
            return inner as ReviewOutput;
          }
        }
      }
    }
  }

  throw new Error(`Could not extract ReviewOutput from: ${JSON.stringify(parsed).slice(0, 300)}`);
}

function extractCost(parsed: unknown): number | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const p = parsed as Record<string, unknown>;
  if ('cost_usd' in p && typeof p.cost_usd === 'number') return p.cost_usd;
  if ('usage' in p && typeof p.usage === 'object' && p.usage !== null) {
    const u = p.usage as Record<string, unknown>;
    if ('cost_usd' in u && typeof u.cost_usd === 'number') return u.cost_usd;
  }
  return undefined;
}

function extractModel(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const p = parsed as Record<string, unknown>;
  if ('model' in p && typeof p.model === 'string') return p.model;
  return undefined;
}
