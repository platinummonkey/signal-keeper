import { describe, it, expect } from 'vitest';
import { configSchema } from './schema.js';

describe('configSchema', () => {
  it('accepts a minimal valid config', () => {
    const result = configSchema.safeParse({
      targets: [{ repo: 'owner/repo', filter: 'all' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.pollIntervalSeconds).toBe(300);
    expect(result.data.maxConcurrentReviews).toBe(3);
    expect(result.data.reviewModel).toBe('sonnet');
    expect(result.data.trustedOrgs).toEqual([]);
  });

  it('applies all defaults', () => {
    const result = configSchema.safeParse({
      targets: [{ org: 'my-org', filter: 'all' }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.github.tokenCommand).toBe('gh auth token');
    expect(result.data.notifications.enabled).toBe(true);
    expect(result.data.notifications.categories).toContain('needs-changes');
    expect(result.data.workDir).toBe('~/.pr-auto-reviewer/repos');
  });

  it('accepts trustedOrgs', () => {
    const result = configSchema.safeParse({
      targets: [{ repo: 'owner/repo', filter: 'all' }],
      trustedOrgs: ['DataDog', 'datadog-labs'],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.trustedOrgs).toEqual(['DataDog', 'datadog-labs']);
  });

  it('rejects a repo target without owner/name format', () => {
    const result = configSchema.safeParse({
      targets: [{ repo: 'no-slash', filter: 'all' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid filter value', () => {
    const result = configSchema.safeParse({
      targets: [{ repo: 'owner/repo', filter: 'unknown' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative pollIntervalSeconds', () => {
    const result = configSchema.safeParse({
      targets: [{ repo: 'owner/repo', filter: 'all' }],
      pollIntervalSeconds: -1,
    });
    expect(result.success).toBe(false);
  });

  it('allows empty targets array (validated later in loader)', () => {
    const result = configSchema.safeParse({ targets: [] });
    expect(result.success).toBe(true);
  });

  it('accepts org target with team filter and team slug', () => {
    const result = configSchema.safeParse({
      targets: [{ org: 'my-org', filter: 'team', team: 'platform' }],
    });
    expect(result.success).toBe(true);
  });
});
