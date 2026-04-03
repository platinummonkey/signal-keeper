import { api } from './api.ts';
import { renderDiff } from './diff.ts';
import type { PR, ReviewCategory, AppEvent } from './types.ts';

// ── Helpers ───────────────────────────────────────────────────────
function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function ago(iso: string | null): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast t-${{ success: 'ok', error: 'err', info: 'info' }[type]}`;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ── Modal ─────────────────────────────────────────────────────────
let modalResolve: ((v: string | null) => void) | null = null;

function modal(title: string, desc: string, placeholder: string): Promise<string | null> {
  $('m-title').textContent = title;
  $('m-desc').textContent = desc;
  const inp = $<HTMLTextAreaElement>('m-input');
  inp.placeholder = placeholder;
  inp.value = '';
  $('modal-overlay').classList.add('open');
  inp.focus();
  return new Promise(res => { modalResolve = res; });
}
function closeModal(val: string | null = null): void {
  $('modal-overlay').classList.remove('open');
  modalResolve?.(val);
  modalResolve = null;
}
$('m-cancel').addEventListener('click', () => closeModal(null));
$('m-ok').addEventListener('click', () => closeModal($<HTMLTextAreaElement>('m-input').value));
$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) closeModal(null);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(null); });

// ── Badges ────────────────────────────────────────────────────────
const CATEGORY_MAP: Record<ReviewCategory, [string, string]> = {
  'auto-merge':      ['b-auto',  '✓ auto-merge'],
  'needs-attention': ['b-attn',  '👀 attention'],
  'needs-changes':   ['b-chng',  '⚠ changes'],
  'block':           ['b-block', '✗ block'],
};
function catBadge(cat?: ReviewCategory | null): string {
  if (!cat) return '<span class="badge b-gray">⏳ pending</span>';
  const [cls, lbl] = CATEGORY_MAP[cat] ?? ['b-gray', esc(cat)];
  return `<span class="badge ${cls}">${lbl}</span>`;
}

// ── State ─────────────────────────────────────────────────────────
let prs: PR[] = [];
let selId: number | null = null;
let curFilter: string = 'all';
let curRepo: string = 'all';
let diffLoaded = false;
let ciLoaded = false;
let ciPollTimer: ReturnType<typeof setInterval> | null = null;

// ── PR List ───────────────────────────────────────────────────────
async function fetchPRs(): Promise<void> {
  try {
    prs = await api.getPRs();
    updateRepoDropdown();
    renderList();
  } catch (e) {
    $('pr-list').innerHTML = `<div class="empty-state">Error: ${esc((e as Error).message)}</div>`;
  }
}

function updateRepoDropdown(): void {
  const sel = $<HTMLSelectElement>('repo-select');
  const repos = [...new Set(prs.map(p => `${p.owner}/${p.repo}`))].sort();
  const prev = sel.value;
  sel.innerHTML = '<option value="all">All repos</option>' +
    repos.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  sel.value = repos.includes(prev) ? prev : 'all';
  if (sel.value !== prev) curRepo = 'all';
}

function filteredPRs(): PR[] {
  return prs
    .filter(p => curFilter === 'all' || p.latest_review?.category === curFilter)
    .filter(p => curRepo === 'all' || `${p.owner}/${p.repo}` === curRepo);
}

function renderList(): void {
  const list = filteredPRs();
  const el = $('pr-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${
      prs.length ? 'No PRs match this filter.' : 'No open PRs.<br>Is the daemon running?'
    }</div>`;
    return;
  }
  // All user content is escaped via esc() before insertion
  el.innerHTML = list.map(pr => {
    const ext  = pr.is_external     ? '<span class="badge b-ext">ext</span>' : '';
    const appr = pr.pending_approval ? '<span class="badge b-pend">⏸</span>' : '';
    return `<div class="pr-item${pr.id === selId ? ' selected' : ''}" data-id="${pr.id}">
      <div class="pr-item-top">
        <span class="pr-repo">${esc(pr.owner)}/${esc(pr.repo)}</span>
        <span class="pr-num">#${pr.number}</span>
        <div class="pr-badges">${ext}${appr}${catBadge(pr.latest_review?.category)}</div>
      </div>
      <div class="pr-title">${esc(pr.title)}</div>
      <div class="pr-meta">by ${esc(pr.author)} · ${ago(pr.updated_at)}</div>
    </div>`;
  }).join('');

  el.querySelectorAll<HTMLElement>('.pr-item').forEach(row =>
    row.addEventListener('click', () => openPR(parseInt(row.dataset.id!))));
}

// ── Detail ────────────────────────────────────────────────────────
function openPR(id: number): void {
  selId = id;
  diffLoaded = false;
  ciLoaded = false;
  stopCIPoll();
  renderList();
  const pr = prs.find(p => p.id === id);
  if (!pr) return;
  $('detail-empty').style.display = 'none';
  $('detail-content').style.display = 'flex';
  renderHeader(pr);
  renderBody(pr);
  renderActions(pr);
}

function renderHeader(pr: PR): void {
  $('dh-title').textContent = pr.title;
  const extB  = pr.is_external     ? `<span class="mpill"><span class="badge b-ext">external</span></span>` : '';
  const apprB = pr.pending_approval ? `<span class="mpill"><span class="badge b-pend">⏸ workflows need approval</span></span>` : '';
  const ciB   = pr.external_stage === 'ci_pending'
    ? `<span class="mpill"><span class="badge b-attn">⟳ CI running</span></span>` : '';
  // All values are escaped; anchor href is from our own DB (PR URL from GitHub API)
  $('detail-meta').innerHTML =
    `<span class="mpill">${catBadge(pr.latest_review?.category)}</span>
     ${extB}${apprB}${ciB}
     <span class="mpill">by <strong>${esc(pr.author)}</strong></span>
     <span class="mpill">base: <code>${esc(pr.base_branch)}</code></span>
     <span class="mpill">sha: <code>${esc(pr.head_sha.slice(0, 7))}</code></span>
     <span class="mpill"><a href="${esc(pr.url)}" target="_blank" rel="noopener noreferrer">Open in GitHub ↗</a></span>`;
}

function renderBody(pr: PR): void {
  const rev = pr.latest_review;
  let html = '';

  if (pr.body?.trim()) {
    html += `<div class="section"><div class="sec-hdr">Description</div>
      <div class="sec-body"><div class="desc-text">${esc(pr.body)}</div></div></div>`;
  }

  if (rev) {
    const conf = Math.round((rev.confidence ?? 0) * 100);
    const cost = rev.cost_usd != null ? ` · $${rev.cost_usd.toFixed(4)}` : '';
    const notes = (rev.notes ?? []).map(n => `<li>${esc(n)}</li>`).join('');
    const changes = (rev.suggested_changes ?? []).map(sc =>
      `<div class="chg-item">
        <div class="chg-file">${esc(sc.file)}</div>
        <div class="chg-desc">${esc(sc.description)}</div>
        ${sc.suggestion ? `<div class="chg-sug">${esc(sc.suggestion)}</div>` : ''}
      </div>`).join('');
    html += `<div class="section"><div class="sec-hdr">Review</div><div class="sec-body">
      <div class="rev-top">${catBadge(rev.category)}<span class="rev-conf">confidence: ${conf}%${cost}</span></div>
      <div class="rev-summary">${esc(rev.summary)}</div>
      ${notes ? `<ul class="notes">${notes}</ul>` : ''}
      ${changes}
    </div></div>`;
  } else {
    html += `<div class="section"><div class="sec-body" style="color:var(--text-dim);font-size:13px">No review yet — daemon is processing.</div></div>`;
  }

  html += `<div class="section" id="ci-section">
    <button class="diff-toggle" id="ci-toggle">
      <span class="arrow">▶</span> CI
      <span id="ci-status-inline" style="font-weight:400;margin-left:6px"></span>
      <button class="ci-refresh" id="ci-refresh-btn" style="margin-left:auto">↻ Refresh</button>
    </button>
    <div class="diff-body" id="ci-body"><div class="diff-loading">Click to load…</div></div>
  </div>`;

  html += `<div class="section" id="diff-section">
    <button class="diff-toggle" id="diff-toggle">
      <span class="arrow">▶</span> Diff
      <span id="diff-stats-inline" style="font-weight:400;margin-left:4px"></span>
    </button>
    <div class="diff-body" id="diff-body"><div class="diff-loading">Click to load…</div></div>
  </div>`;

  $('detail-scroll').innerHTML = html;

  // Eagerly load CI status so the header badge populates without needing to expand
  void loadCI(pr);

  $('ci-toggle').addEventListener('click', (e) => {
    // Don't toggle if clicking the refresh button inside the toggle
    if ((e.target as HTMLElement).id === 'ci-refresh-btn') return;
    void toggleCI(pr);
  });
  $('ci-refresh-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    ciLoaded = false;
    const body = $('ci-body');
    if (body.classList.contains('open')) {
      body.innerHTML = '<div class="diff-loading">Refreshing…</div>';
      void loadCI(pr);
    }
  });
  $('diff-toggle').addEventListener('click', () => toggleDiff(pr));
}

function stopCIPoll(): void {
  if (ciPollTimer) { clearInterval(ciPollTimer); ciPollTimer = null; }
}

// ── CI Status ─────────────────────────────────────────────────────
const CI_ICON: Record<string, string> = {
  pending: '⟳', in_progress: '⟳', queued: '⏳', waiting: '⏳', requested: '⏳',
  completed: '', action_required: '⏸',
};
const CONCLUSION_ICON: Record<string, string> = {
  success: '✓', skipped: '◌', neutral: '◌',
  failure: '✗', cancelled: '✗', timed_out: '✗', action_required: '⏸',
};
const CONCLUSION_CLASS: Record<string, string> = {
  success: 'color:var(--green)', skipped: 'color:var(--text-dim)', neutral: 'color:var(--text-dim)',
  failure: 'color:var(--red)', cancelled: 'color:var(--red)', timed_out: 'color:var(--red)',
  action_required: 'color:var(--yellow)',
};

async function toggleCI(pr: PR): Promise<void> {
  const toggle = $('ci-toggle');
  const body   = $('ci-body');
  const isOpen = body.classList.contains('open');
  if (isOpen) {
    body.classList.remove('open');
    toggle.classList.remove('open');
    return;
  }
  body.classList.add('open');
  toggle.classList.add('open');
  if (!ciLoaded) await loadCI(pr);
}

async function loadCI(pr: PR): Promise<void> {
  ciLoaded = true;
  try {
    const { status, runs } = await api.getCI(pr.id);

    // Update inline badge
    const inline = $('ci-status-inline');
    if (inline) inline.innerHTML = ciStatusBadge(status);

    const body = $('ci-body');
    if (!runs.length) {
      body.innerHTML = '<div class="diff-loading" style="color:var(--text-dim)">No workflow runs found.</div>';
    } else {
      const rows = runs.map(r => {
        const icon  = r.conclusion ? (CONCLUSION_ICON[r.conclusion] ?? '?') : (CI_ICON[r.status ?? ''] ?? '⟳');
        const style = r.conclusion ? (CONCLUSION_CLASS[r.conclusion] ?? '') : 'color:var(--yellow)';
        const label = r.conclusion
          ? `<span style="${style}">${esc(r.conclusion)}</span>`
          : `<span style="color:var(--yellow)">${esc(r.status ?? 'unknown')}</span>`;
        const runUrl = `https://github.com/${pr.owner}/${pr.repo}/actions/runs/${r.id}`;
        return `<div class="ci-run">
          <span class="ci-run-icon" style="${style}">${icon}</span>
          <span class="ci-run-name"><a href="${esc(runUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.name ?? 'Workflow')}</a></span>
          <span class="ci-run-status">${label}</span>
        </div>`;
      }).join('');
      body.innerHTML = `<div class="ci-runs" style="padding:10px 14px">${rows}</div>`;
    }

    // Auto-poll while pending; stop once everything has passed
    if (status === 'pending') {
      if (!ciPollTimer) {
        ciPollTimer = setInterval(() => void loadCI(pr), 15_000);
      }
    } else {
      stopCIPoll();
    }
  } catch (e) {
    $('ci-body').innerHTML = `<div class="diff-loading" style="color:var(--red)">Failed: ${esc((e as Error).message)}</div>`;
    ciLoaded = false;
    stopCIPoll();
  }
}

function ciStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    pending:  ['ci-pending', '⟳ pending'],
    passed:   ['ci-passed',  '✓ passed'],
    failed:   ['ci-failed',  '✗ failed'],
    no_runs:  ['ci-noruns',  '— no runs'],
  };
  const [cls, label] = map[status] ?? ['ci-noruns', esc(status)];
  return `<span class="ci-badge ${cls}">${label}</span>`;
}

// ── Diff ──────────────────────────────────────────────────────────
async function toggleDiff(pr: PR): Promise<void> {
  const toggle = $('diff-toggle');
  const body   = $('diff-body');
  const isOpen = body.classList.contains('open');

  if (isOpen) {
    body.classList.remove('open');
    toggle.classList.remove('open');
    return;
  }
  body.classList.add('open');
  toggle.classList.add('open');
  if (diffLoaded) return;

  diffLoaded = true;
  body.innerHTML = '<div class="diff-loading">Loading diff…</div>';

  try {
    const { diff, files } = await api.getDiff(pr.id);
    body.innerHTML = renderDiff(diff, files, pr.url);

    const statsEl = $('diff-stats-inline');
    if (statsEl && files.length) {
      const adds = files.reduce((s, f) => s + f.additions, 0);
      const dels = files.reduce((s, f) => s + f.deletions, 0);
      statsEl.innerHTML = `— <span class="add">+${adds}</span> <span class="del">-${dels}</span> across ${files.length} file${files.length !== 1 ? 's' : ''}`;
    }
  } catch (e) {
    body.innerHTML = `<div class="diff-loading" style="color:var(--red)">Failed: ${esc((e as Error).message)}</div>`;
    diffLoaded = false;
  }
}

// ── Action bar ────────────────────────────────────────────────────
function renderActions(pr: PR): void {
  const canMerge = pr.latest_review?.category === 'auto-merge';
  const needsCI  = !!(pr.pending_approval || pr.external_stage === 'awaiting_approval');
  $('action-bar').innerHTML = `
    <button class="btn btn-success" ${canMerge ? '' : 'disabled'} data-act="merge">Merge</button>
    <button class="btn" data-act="comment">Comment</button>
    <button class="btn" data-act="ai-comment">✨ AI Comment</button>
    <button class="btn" data-act="review">Re-review</button>
    <button class="btn" data-act="custom-review">Custom prompt…</button>
    <button class="btn btn-warning" ${pr.latest_review ? '' : 'disabled'} data-act="autofix">Autofix</button>
    ${needsCI ? `<button class="btn btn-warning" data-act="approve-ci">⏸ Approve CI</button>` : ''}
    <button class="btn btn-danger" data-act="close">Close</button>
  `;
  $('action-bar').querySelectorAll<HTMLButtonElement>('[data-act]').forEach(btn =>
    btn.addEventListener('click', (e) => void handleAction(e, pr, btn.dataset.act!)));
}

// ── Actions ───────────────────────────────────────────────────────
async function withSpinner<T>(btn: HTMLButtonElement, fn: () => Promise<T>): Promise<T> {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

async function handleAction(e: Event, pr: PR, act: string): Promise<void> {
  const btn = e.currentTarget as HTMLButtonElement;

  switch (act) {
    case 'merge':
      if (!confirm('Merge this PR?')) return;
      await withSpinner(btn, async () => {
        await api.merge(pr.id);
        toast('PR merged', 'success');
        clearDetail(); await fetchPRs();
      }).catch((err: Error) => toast(`Merge failed: ${err.message}`, 'error'));
      break;

    case 'comment': {
      const body = await modal('Post a Comment', 'Write a comment to post on the PR.', 'Leave a comment…');
      if (!body?.trim()) return;
      await api.comment(pr.id, body)
        .then(() => toast('Comment posted', 'success'))
        .catch((err: Error) => toast(`Failed: ${err.message}`, 'error'));
      break;
    }
    case 'ai-comment': {
      const instruction = await modal('Generate AI Comment',
        'Describe focus, or leave blank to summarise review findings.',
        'e.g. Focus on security concerns…');
      if (instruction === null) return;
      await withSpinner(btn, () => api.generateComment(pr.id, instruction))
        .then(() => toast('Comment posted', 'success'))
        .catch((err: Error) => toast(`Failed: ${err.message}`, 'error'));
      break;
    }
    case 'review':
      await api.review(pr.id)
        .then(() => toast('Re-review queued', 'info'))
        .catch((err: Error) => toast(`Failed: ${err.message}`, 'error'));
      break;

    case 'custom-review': {
      const prompt = await modal('Custom Re-review Prompt',
        'Add extra instructions. Submit empty for a plain re-review.',
        'e.g. Focus on security and error handling…');
      if (prompt === null) return;
      await api.review(pr.id, prompt)
        .then(() => toast('Re-review queued', 'info'))
        .catch((err: Error) => toast(`Failed: ${err.message}`, 'error'));
      break;
    }
    case 'approve-ci':
      await withSpinner(btn, () => api.approveCI(pr.id))
        .then(async () => { toast('CI approved', 'success'); await fetchPRs(); refreshDetail(); })
        .catch((err: Error) => toast(`Failed: ${err.message}`, 'error'));
      break;

    case 'autofix':
      await api.autofix(pr.id)
        .then(() => toast('Autofix started — follow-up PR will be created', 'info'))
        .catch((err: Error) => toast(`Failed: ${err.message}`, 'error'));
      break;

    case 'close':
      if (!confirm('Close this PR?')) return;
      await withSpinner(btn, async () => {
        await api.close(pr.id);
        toast('PR closed', 'success');
        clearDetail(); await fetchPRs();
      }).catch((err: Error) => toast(`Close failed: ${err.message}`, 'error'));
      break;
  }
}

function clearDetail(): void {
  selId = null;
  stopCIPoll();
  $('detail-empty').style.display = '';
  $('detail-content').style.display = 'none';
}

function refreshDetail(): void {
  if (!selId) return;
  const pr = prs.find(p => p.id === selId);
  if (pr) { renderHeader(pr); renderBody(pr); renderActions(pr); }
}

// ── Filters ───────────────────────────────────────────────────────
$('filters').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  curFilter = btn.dataset.f!;
  renderList();
});

$<HTMLSelectElement>('repo-select').addEventListener('change', (e) => {
  curRepo = (e.target as HTMLSelectElement).value;
  renderList();
});

// ── SSE ───────────────────────────────────────────────────────────
function connectSSE(): void {
  const es = new EventSource('/api/events');
  const dot = $('status-dot');
  const lbl = $('status-label');
  es.onopen  = () => { dot.className = 'live';  lbl.textContent = 'Live'; };
  es.onerror = () => { dot.className = 'error'; lbl.textContent = 'Reconnecting…'; };
  es.onmessage = async (ev) => {
    let event: AppEvent;
    try { event = JSON.parse(ev.data) as AppEvent; } catch { return; }

    if (event.type === 'poll:complete') { await fetchPRs(); void fetchStatus(); }
    if (event.type === 'review:complete') {
      toast(`Review: ${event.owner}/${event.repo}#${event.number} → ${event.category}`, 'info');
      await fetchPRs();
      if (selId === event.prId) refreshDetail();
    }
    if (event.type === 'approval:needed') {
      toast(`⏸ ${event.owner}/${event.repo}#${event.number} needs CI approval`, 'info');
      await fetchPRs();
    }
  };
}

// ── Status ────────────────────────────────────────────────────────
async function fetchStatus(): Promise<void> {
  try {
    const s = await api.getStatus();
    $('last-poll').textContent = s.lastPollAt ? `Last poll: ${ago(s.lastPollAt)}` : '';
  } catch { /* ignore */ }
}

// ── Boot ──────────────────────────────────────────────────────────
void fetchPRs();
void fetchStatus();
connectSSE();
setInterval(() => void fetchStatus(), 30_000);
