export type FilterType = 'all' | 'assigned' | 'team' | 'author';

export interface OrgTarget {
  org: string;
  filter: FilterType;
  team?: string;
}

export interface RepoTarget {
  repo: string;
  filter: FilterType;
}

export type Target = OrgTarget | RepoTarget;

export interface NotificationsConfig {
  enabled: boolean;
  categories: Array<'auto-merge' | 'needs-attention' | 'needs-changes' | 'block'>;
}

export interface Config {
  github: {
    tokenCommand: string;
  };
  pollIntervalSeconds: number;
  targets: Target[];
  notifications: NotificationsConfig;
  maxConcurrentReviews: number;
  maxReviewCostUsd: number;
  reviewModel: string;
  workDir: string;
  trustedOrgs: string[];
}
