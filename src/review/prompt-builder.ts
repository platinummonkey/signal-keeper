import type { GithubPR } from '../github/types.js';

export function buildReviewPrompt(pr: GithubPR, customInstruction?: string): string {
  const fileList = pr.files
    ?.map((f) => `  ${f.status.padEnd(10)} ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n') ?? '  (file list unavailable)';

  const diffSection = pr.diff
    ? `\n## Diff\n\`\`\`diff\n${truncateDiff(pr.diff)}\n\`\`\``
    : '';

  const customSection = customInstruction
    ? `\n## Special Instructions\n${customInstruction}\n`
    : '';

  return `You are a code reviewer. Review the following GitHub Pull Request and provide structured feedback.

## PR Details
- **Repo**: ${pr.owner}/${pr.repo}
- **PR #${pr.number}**: ${pr.title}
- **Author**: ${pr.author}
- **Base branch**: ${pr.baseBranch}
- **URL**: ${pr.url}

## Changed Files
${fileList}
${diffSection}
${customSection}
## Review Guidelines

Categorize your review as one of:
- **auto-merge**: Safe to merge without human review. Changes are straightforward, well-tested, follow existing patterns, and pose no risk.
- **needs-attention**: Generally fine but worth a human glance. Minor style issues, small concerns, or things the author should be aware of.
- **needs-changes**: Issues found that should be addressed before merging. Bugs, missing tests, design concerns, or security issues.
- **block**: Serious problems. Security vulnerabilities, major bugs, breaking changes without migration, or fundamental design flaws.

Be concise and actionable. Focus on substance over style nits unless style issues are significant.`;
}

function truncateDiff(diff: string, maxChars = 50_000): string {
  if (diff.length <= maxChars) return diff;
  return diff.slice(0, maxChars) + '\n\n... [diff truncated] ...';
}
