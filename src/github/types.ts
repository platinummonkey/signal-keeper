export interface GithubPR {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  headSha: string;
  baseBranch: string;
  state: 'open' | 'closed' | 'merged';
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  diff?: string;
  files?: GithubFile[];
}

export interface GithubFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
}
