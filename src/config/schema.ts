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

const notificationCategorySchema = z.enum(['auto-merge', 'needs-attention', 'needs-changes', 'fix-merge', 'block']);
type NotificationCategory = z.infer<typeof notificationCategorySchema>;

const notificationsSchema = z.object({
  enabled: z.boolean().default(true),
  categories: z
    .array(notificationCategorySchema)
    .default(['needs-attention', 'needs-changes', 'block']),
});

export const configSchema = z.object({
  github: z.object({
    tokenCommand: z.string().default('gh auth token'),
  }).default(() => ({ tokenCommand: 'gh auth token' })),
  pollIntervalSeconds: z.number().int().gt(0).default(300),
  targets: z.array(targetSchema).default([]),
  // Zod v4 requires the outer .default() factory to return the fully-resolved
  // output type; inner field defaults do not auto-apply here.
  notifications: notificationsSchema.default(() => ({
    enabled: true,
    categories: ['needs-attention', 'needs-changes', 'block'] as NotificationCategory[],
  })),
  maxConcurrentReviews: z.number().int().gt(0).default(3),
  maxReviewCostUsd: z.number().gt(0).default(0.5),
  reviewModel: z.string().default('sonnet'),
  workDir: z.string().default('~/.signal-keeper/repos'),
  trustedOrgs: z.array(z.string()).default([]),
  maxFixCostUsd: z.number().gt(0).default(10.0),
  port: z.number().int().min(1024).max(65535).default(7777),
});

export type ConfigInput = z.input<typeof configSchema>;
export type ConfigOutput = z.output<typeof configSchema>;
