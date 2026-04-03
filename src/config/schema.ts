import { z } from 'zod';

const filterSchema = z.enum(['all', 'assigned', 'team', 'author']);

const orgTargetSchema = z.object({
  org: z.string().min(1),
  filter: filterSchema,
  team: z.string().optional(),
});

const repoTargetSchema = z.object({
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'repo must be "owner/name"'),
  filter: filterSchema,
});

const targetSchema = z.union([orgTargetSchema, repoTargetSchema]);

const notificationsSchema = z.object({
  enabled: z.boolean().default(true),
  categories: z
    .array(z.enum(['auto-merge', 'needs-attention', 'needs-changes', 'block']))
    .default(['needs-attention', 'needs-changes', 'block']),
});

export const configSchema = z.object({
  github: z.object({
    tokenCommand: z.string().default('gh auth token'),
  }).default({}),
  pollIntervalSeconds: z.number().int().positive().default(300),
  targets: z.array(targetSchema).default([]),
  notifications: notificationsSchema.default({}),
  maxConcurrentReviews: z.number().int().positive().default(3),
  maxReviewCostUsd: z.number().positive().default(0.5),
  reviewModel: z.string().default('sonnet'),
  workDir: z.string().default('~/.pr-auto-reviewer/repos'),
  trustedOrgs: z.array(z.string()).default([]),
});

export type ConfigInput = z.input<typeof configSchema>;
export type ConfigOutput = z.output<typeof configSchema>;
