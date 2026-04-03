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

  // Append JSON schema to the prompt — the CLI has no structured-output flag,
  // so we ask the model to reply with ONLY a JSON object.
  const fullPrompt = `${prompt}

## Required Output Format

Reply with ONLY a valid JSON object — no markdown, no explanation, no code fences.
The object must match this schema exactly:

${JSON.stringify(REVIEW_JSON_SCHEMA, null, 2)}`;

  const args = [
    '--print',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--tools', 'Read',
    '--model', model,
    '--max-budget-usd', String(maxBudgetUsd),
    fullPrompt,
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
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Claude output is not an object');
  }

  const p = parsed as Record<string, unknown>;

  // Direct top-level JSON object with category
  if ('category' in p) {
    return p as unknown as ReviewOutput;
  }

  // The CLI --output-format json puts the assistant's final text in p.result
  if (typeof p.result === 'string') {
    return extractFromText(p.result);
  }

  // Fallback: result is already a parsed object
  if (typeof p.result === 'object' && p.result !== null) {
    const r = p.result as Record<string, unknown>;
    if ('category' in r) return r as unknown as ReviewOutput;
  }

  throw new Error(`Could not extract ReviewOutput from: ${JSON.stringify(parsed).slice(0, 300)}`);
}

function extractFromText(text: string): ReviewOutput {
  // 1. Try the whole string as JSON
  try {
    const direct = JSON.parse(text);
    if (typeof direct === 'object' && direct !== null && 'category' in direct) {
      return direct as ReviewOutput;
    }
  } catch {}

  // 2. Find the first {...} block that parses as a ReviewOutput
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      const candidate = JSON.parse(text.slice(braceStart, braceEnd + 1));
      if (typeof candidate === 'object' && candidate !== null && 'category' in candidate) {
        return candidate as ReviewOutput;
      }
    } catch {}
  }

  // 3. Find a ```json ... ``` block
  const fenceMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) {
    try {
      const candidate = JSON.parse(fenceMatch[1]);
      if (typeof candidate === 'object' && candidate !== null && 'category' in candidate) {
        return candidate as ReviewOutput;
      }
    } catch {}
  }

  throw new Error(`Could not extract ReviewOutput from text: ${text.slice(0, 300)}`);
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
