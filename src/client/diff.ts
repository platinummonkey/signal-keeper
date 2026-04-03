import type { DiffFile } from './types.ts';

const MAX_LINES = 2000;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderDiff(rawDiff: string, files: DiffFile[], prUrl: string): string {
  const lines = rawDiff.split('\n');
  const truncated = lines.length > MAX_LINES;
  const visible = truncated ? lines.slice(0, MAX_LINES) : lines;

  const totalAdds = files.reduce((s, f) => s + f.additions, 0);
  const totalDels = files.reduce((s, f) => s + f.deletions, 0);
  const statsHtml = files.length
    ? `<span class="add">+${totalAdds}</span> <span class="del">-${totalDels}</span> across ${files.length} file${files.length !== 1 ? 's' : ''}`
    : '';

  let tableHtml = '<table class="diff-table">';
  let oldLine = 0;
  let newLine = 0;
  let inFile = false;

  for (const line of visible) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/diff --git a\/(.+) b\/.+/);
      const fname = m ? m[1] : line.slice(11);
      tableHtml += `</table><div class="diff-file-hdr">${esc(fname)}</div><table class="diff-table">`;
      inFile = true;
      oldLine = 0; newLine = 0;
    } else if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) { oldLine = parseInt(m[1]) - 1; newLine = parseInt(m[2]) - 1; }
      tableHtml += `<tr class="d-hunk"><td class="diff-ln"></td><td class="diff-ln"></td><td>${esc(line)}</td></tr>`;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      newLine++;
      tableHtml += `<tr class="d-add"><td class="diff-ln"></td><td class="diff-ln">${newLine}</td><td>${esc(line)}</td></tr>`;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      oldLine++;
      tableHtml += `<tr class="d-del"><td class="diff-ln">${oldLine}</td><td class="diff-ln"></td><td>${esc(line)}</td></tr>`;
    } else if (line.startsWith('\\') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('Binary')) {
      // skip meta lines
    } else if (inFile) {
      oldLine++; newLine++;
      tableHtml += `<tr class="d-ctx"><td class="diff-ln">${oldLine}</td><td class="diff-ln">${newLine}</td><td>${esc(line)}</td></tr>`;
    }
  }
  tableHtml += '</table>';

  const truncNote = truncated
    ? `<div class="diff-truncated">⚠ Diff truncated at ${MAX_LINES} lines. <a href="${esc(prUrl)}/files" target="_blank" rel="noopener noreferrer">View full diff on GitHub ↗</a></div>`
    : '';

  return `<div class="diff-stats-bar">${statsHtml}</div>${tableHtml}${truncNote}`;
}
