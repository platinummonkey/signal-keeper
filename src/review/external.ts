import type { GithubPR } from '../github/types.js';
import type { CIStatus } from '../github/client.js';

export function buildInitialExternalPrompt(pr: GithubPR): string {
  const fileList = pr.files
    ?.map((f) => `  ${f.status.padEnd(10)} ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n') ?? '  (file list unavailable)';

  const diffSection = pr.diff
    ? `\n## Diff\n\`\`\`diff\n${truncateDiff(pr.diff)}\n\`\`\``
    : '';

  return `You are reviewing a pull request from an **external contributor** (not a member of the trusted organization). CI has not been approved to run yet.

## PR Details
- **Repo**: ${pr.owner}/${pr.repo}
- **PR #${pr.number}**: ${pr.title}
- **Author**: ${pr.author} (external contributor)
- **Base branch**: ${pr.baseBranch}
- **URL**: ${pr.url}

## Changed Files
${fileList}
${diffSection}

## Initial Review Guidelines

This is a preliminary review before CI is approved. Focus on:
1. **Malicious intent** — Does this code look safe to run? Check for supply chain attacks, data exfiltration, backdoors, or any obviously malicious patterns.
2. **Code quality** — Is the change reasonable and well-structured?
3. **PR description** — Does the author explain what they're doing and why?

Do NOT make a final merge decision. Your category should reflect whether it is safe to proceed:
- **auto-merge**: Code looks completely clean and safe — CI approval is a formality.
- **needs-attention**: Looks fine but worth a closer look before approving CI.
- **needs-changes**: Issues in the code that should be addressed before CI runs.
- **block**: Do not approve CI — suspicious, malicious, or fundamentally broken.

Be especially critical of changes to CI/CD config, dependency files, or scripts.`;
}

export function buildFinalExternalPrompt(pr: GithubPR, ciStatus: CIStatus, failedChecks: string[]): string {
  const fileList = pr.files
    ?.map((f) => `  ${f.status.padEnd(10)} ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n') ?? '  (file list unavailable)';

  const diffSection = pr.diff
    ? `\n## Diff\n\`\`\`diff\n${truncateDiff(pr.diff)}\n\`\`\``
    : '';

  const ciSection = ciStatus === 'passed'
    ? '**CI Status**: All checks passed ✓'
    : ciStatus === 'failed'
      ? `**CI Status**: Failed ✗\nFailed checks:\n${failedChecks.map((c) => `  - ${c}`).join('\n') || '  (unknown)'}`
      : '**CI Status**: No CI runs found';

  return `You are doing a final review of a pull request from an **external contributor**. CI has completed.

## PR Details
- **Repo**: ${pr.owner}/${pr.repo}
- **PR #${pr.number}**: ${pr.title}
- **Author**: ${pr.author} (external contributor)
- **Base branch**: ${pr.baseBranch}
- **URL**: ${pr.url}

## CI Results
${ciSection}

## Changed Files
${fileList}
${diffSection}

## Final Review Guidelines

Make a definitive merge recommendation. Consider:
1. **Code correctness** — Does the change do what it claims?
2. **CI results** — Do failures indicate real problems or flaky tests?
3. **Code quality** — Is it maintainable and consistent with the codebase?
4. **External contributor standards** — External PRs should meet the same bar as internal ones.

Categories:
- **auto-merge**: All CI passes and the change is correct and clean.
- **needs-attention**: Minor issues or a CI failure that looks flaky.
- **needs-changes**: Real problems that must be addressed before merging.
- **block**: Do not merge — serious issues, security concerns, or CI failures that indicate broken code.`;
}

function truncateDiff(diff: string, maxChars = 50_000): string {
  if (diff.length <= maxChars) return diff;
  return diff.slice(0, maxChars) + '\n\n... [diff truncated] ...';
}
