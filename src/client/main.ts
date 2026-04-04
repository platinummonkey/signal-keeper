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
  'auto-merge':      ['b-auto',       '✓ auto-merge'],
  'merge-fix':       ['b-merge-fix',  '🔀 merge+fix'],
  'needs-attention': ['b-attn',       '👀 attention'],
  'needs-changes':   ['b-chng',       '⚠ changes'],
  'fix-merge':       ['b-fix-merge',  '🔧 fix CI'],
  'block':           ['b-block',      '✗ block'],
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
let curSearch: string = '';
let diffLoaded = false;
let ciLoaded = false;
let ciPollTimer: ReturnType<typeof setInterval> | null = null;
type FixTabStatus = 'running' | 'done' | 'failed';
interface FixTab {
  sessionId: string;
  jobName: string;
  logs: string[];
  status: FixTabStatus;
  followUpPrUrl: string | null;
  es: EventSource | null;
}

type TabId = 'review' | 'description' | 'ci' | 'diff' | string; // string = fix session ID
let activeTab: TabId = 'review';
let lastCIData: { status: string; runs: import('./types.ts').WorkflowRun[] } | null = null;
// Fix tabs persisted by PR id so navigating away and back preserves them
const fixTabsByPr = new Map<number, FixTab[]>();
let fixTabs: FixTab[] = [];  // reference to the current PR's fix tabs

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
  const q = curSearch.toLowerCase().trim();
  return prs
    .filter(p => curFilter === 'all' || p.latest_review?.category === curFilter)
    .filter(p => curRepo === 'all' || `${p.owner}/${p.repo}` === curRepo)
    .filter(p => {
      if (!q) return true;
      const cat = p.latest_review?.category ?? '';
      const catLabel = CATEGORY_MAP[cat as ReviewCategory]?.[1] ?? cat;
      return (
        p.title.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        `${p.owner}/${p.repo}`.toLowerCase().includes(q) ||
        `#${p.number}`.includes(q) ||
        cat.includes(q) ||
        catLabel.toLowerCase().includes(q) ||
        (p.latest_review?.summary ?? '').toLowerCase().includes(q)
      );
    });
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
    const ext  = pr.is_external      ? '<span class="badge b-ext">ext</span>' : '';
    const appr = pr.pending_approval  ? '<span class="badge b-pend">⏸</span>' : '';
    return `<div class="pr-item${pr.id === selId ? ' selected' : ''}" data-id="${pr.id}">
      <div class="pr-item-top">
        <span class="pr-repo">${esc(pr.owner)}/${esc(pr.repo)}</span>
        <span class="pr-num">#${pr.number}</span>
        <div class="pr-flags">${ext}${appr}</div>
      </div>
      <div class="pr-title">${esc(pr.title)}</div>
      <div class="pr-bottom">
        <span class="pr-cat">${catBadge(pr.latest_review?.category)}</span>
        <span class="pr-meta">by ${esc(pr.author)} · ${ago(pr.updated_at)}</span>
      </div>
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
  lastCIData = null;
  activeTab = 'review';
  stopCIPoll();
  // Restore (or create) fix tabs for this PR — EventSources stay alive across navigation
  if (!fixTabsByPr.has(id)) fixTabsByPr.set(id, []);
  fixTabs = fixTabsByPr.get(id)!;
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

  // Category badge — standalone, prominent row below the title
  $('dh-category').innerHTML = catBadge(pr.latest_review?.category);

  const extB  = pr.is_external     ? `<span class="mpill"><span class="badge b-ext">external</span></span>` : '';
  const apprB = pr.pending_approval ? `<span class="mpill"><span class="badge b-pend">⏸ workflows need approval</span></span>` : '';
  const ciB   = pr.external_stage === 'ci_pending'
    ? `<span class="mpill"><span class="badge b-attn">⟳ CI running</span></span>` : '';
  $('detail-meta').innerHTML =
    `${extB}${apprB}${ciB}
     <span class="mpill">by <strong>${esc(pr.author)}</strong></span>
     <span class="mpill">base: <code>${esc(pr.base_branch)}</code></span>
     <span class="mpill">sha: <code>${esc(pr.head_sha.slice(0, 7))}</code></span>
     <span class="mpill"><a href="${esc(pr.url)}" target="_blank" rel="noopener noreferrer">Open in GitHub ↗</a></span>`;
}

// ── Tabs ──────────────────────────────────────────────────────────
function renderBody(pr: PR): void {
  renderTabBar(pr);

  // Load CI in background immediately to populate the tab badge
  void loadCI(pr);

  selectTab(pr, 'review');
}

function renderTabBar(pr: PR): void {
  const fixBtns = fixTabs.map(ft => {
    const icon = ft.status === 'running' ? '⟳' : ft.status === 'done' ? '✓' : '✗';
    const cls  = `fix-${ft.status}`;
    return `<button class="tab-btn ${cls}" data-tab="${esc(ft.sessionId)}">${icon} ${esc(ft.jobName)}</button>`;
  }).join('');
  $('tab-bar').innerHTML = `
    <button class="tab-btn" data-tab="review">Review</button>
    <button class="tab-btn" data-tab="description">Description</button>
    <button class="tab-btn" data-tab="ci">CI <span id="ci-tab-badge"></span></button>
    <button class="tab-btn" data-tab="diff">Diff <span id="diff-tab-badge"></span></button>
    ${fixBtns}
  `;
  $('tab-bar').querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => selectTab(pr, btn.dataset.tab!)));
  // Re-apply active state and ci badge
  $('tab-bar').querySelectorAll<HTMLElement>('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === activeTab));
  if (lastCIData) {
    const badge = document.getElementById('ci-tab-badge');
    if (badge) {
      const m: Record<string, string> = { pending: 'ci-pending', passed: 'ci-passed', failed: 'ci-failed' };
      badge.className = 'tab-badge ' + (m[lastCIData.status] ?? 'ci-noruns');
      badge.textContent = lastCIData.status === 'pending' ? '⟳' : lastCIData.status === 'passed' ? '✓' : lastCIData.status === 'failed' ? '✗' : '';
    }
  }
}

function selectTab(pr: PR, tab: string): void {
  activeTab = tab;
  $('tab-bar').querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab));

  const tc = $('tab-content');

  switch (tab) {
    case 'review':   tc.innerHTML = reviewTabHTML(pr); break;
    case 'description': tc.innerHTML = descriptionTabHTML(pr); break;
    case 'ci':
      if (lastCIData) {
        tc.innerHTML = ciRunsHTML(pr, lastCIData.status, lastCIData.runs);
        bindCIFixButtons(pr);
      } else {
        tc.innerHTML = '<div class="tab-empty">Loading CI…</div>';
        if (!ciLoaded) void loadCI(pr);
      }
      break;
    case 'diff':
      if (!diffLoaded) {
        tc.innerHTML = '<div class="tab-empty">Loading diff…</div>';
        void loadDiff(pr);
      }
      break;
    default: {
      // Fix session tab
      const ft = fixTabs.find(f => f.sessionId === tab);
      if (ft) tc.innerHTML = fixTabHTML(ft);
      break;
    }
  }
}

function fixTabHTML(ft: FixTab): string {
  const lines = ft.logs.map(line => {
    const fmt = formatFixLine(line);
    if (!fmt) return '';
    return `<span class="${fmt.cls}">${esc(fmt.text)}\n</span>`;
  }).join('');
  const prLink = ft.followUpPrUrl
    ? `<a class="fix-pr-link" href="${esc(ft.followUpPrUrl)}" target="_blank" rel="noopener noreferrer">↗ View follow-up PR</a>`
    : '';
  return `<div id="fix-log-content">${lines || '<span class="fl-err">Waiting for output…</span>'}${prLink}</div>`;
}

function formatFixLine(raw: string): { cls: string; text: string } | null {
  if (!raw.trim()) return null;
  if (raw.startsWith('[stderr]')) {
    const msg = raw.slice(8).trim();
    if (!msg) return null;
    return { cls: 'fl-err', text: msg };
  }
  if (raw.startsWith('✓')) return { cls: 'fl-done', text: raw };
  if (raw.startsWith('✗')) return { cls: 'fl-fail', text: raw };
  return { cls: 'fl-out', text: raw };
}

function appendFixLog(sessionId: string, line: string): void {
  if (activeTab !== sessionId) return;
  const el = document.getElementById('fix-log-content');
  if (!el) return;
  const fmt = formatFixLine(line);
  if (!fmt) return;
  const span = document.createElement('span');
  span.className = fmt.cls;
  span.textContent = fmt.text + '\n';
  const placeholder = el.querySelector('.fl-err');
  if (placeholder?.textContent?.includes('Waiting')) placeholder.remove();
  el.appendChild(span);
  $('tab-content').scrollTop = $('tab-content').scrollHeight;
}

function reviewTabHTML(pr: PR): string {
  const rev = pr.latest_review;
  if (!rev) return '<div class="tab-empty">No review yet — daemon is processing.</div>';
  const conf = Math.round((rev.confidence ?? 0) * 100);
  const cost = rev.cost_usd != null ? ` · $${rev.cost_usd.toFixed(4)}` : '';
  const notes = (rev.notes ?? []).map(n => `<li>${esc(n)}</li>`).join('');
  const changes = (rev.suggested_changes ?? []).map(sc =>
    `<div class="chg-item">
      <div class="chg-file">${esc(sc.file)}</div>
      <div class="chg-desc">${esc(sc.description)}</div>
      ${sc.suggestion ? `<div class="chg-sug">${esc(sc.suggestion)}</div>` : ''}
    </div>`).join('');
  return `
    <div class="rev-top">${catBadge(rev.category)}<span class="rev-conf">confidence: ${conf}%${cost}</span></div>
    <div class="rev-summary" style="margin-top:10px">${esc(rev.summary)}</div>
    ${notes ? `<ul class="notes" style="margin-top:12px">${notes}</ul>` : ''}
    ${changes ? `<div style="margin-top:14px">${changes}</div>` : ''}
  `;
}

function descriptionTabHTML(pr: PR): string {
  if (!pr.body?.trim()) return '<div class="tab-empty">No description provided.</div>';
  return `<div class="desc-text">${esc(pr.body)}</div>`;
}

function stopCIPoll(): void {
  if (ciPollTimer) { clearInterval(ciPollTimer); ciPollTimer = null; }
}

// ── CI ────────────────────────────────────────────────────────────
const CI_ICON: Record<string, string> = {
  pending:'⟳', in_progress:'⟳', queued:'⏳', waiting:'⏳', requested:'⏳', action_required:'⏸',
};
const CONCLUSION_ICON: Record<string, string> = {
  success:'✓', skipped:'◌', neutral:'◌', failure:'✗', cancelled:'✗', timed_out:'✗', action_required:'⏸',
};
const CONCLUSION_STYLE: Record<string, string> = {
  success:'color:var(--green)', skipped:'color:var(--text-dim)', neutral:'color:var(--text-dim)',
  failure:'color:var(--red)', cancelled:'color:var(--red)', timed_out:'color:var(--red)',
  action_required:'color:var(--yellow)',
};

function ciRunsHTML(pr: PR, status: string, runs: import('./types.ts').WorkflowRun[]): string {
  const badge = ciStatusBadge(status);
  if (!runs.length) return `${badge}<p class="tab-empty" style="margin-top:10px">No workflow runs found.</p>`;

  const groups = runs.map(r => {
    const runIcon  = r.conclusion ? (CONCLUSION_ICON[r.conclusion] ?? '?') : (CI_ICON[r.status ?? ''] ?? '⟳');
    const runStyle = r.conclusion ? (CONCLUSION_STYLE[r.conclusion] ?? '') : 'color:var(--yellow)';
    const runUrl   = `https://github.com/${pr.owner}/${pr.repo}/actions/runs/${r.id}`;

    const jobRows = (r.jobs ?? []).map(j => {
      const jIcon  = j.conclusion ? (CONCLUSION_ICON[j.conclusion] ?? '?') : (CI_ICON[j.status ?? ''] ?? '⟳');
      const jStyle = j.conclusion ? (CONCLUSION_STYLE[j.conclusion] ?? '') : 'color:var(--yellow)';
      const jLabel = j.conclusion ?? j.status ?? 'unknown';
      const isFailed = j.conclusion === 'failure' || j.conclusion === 'timed_out';
      const fixBtn = isFailed
        ? `<button class="ci-fix-btn" data-job-name="${esc(j.name)}">Fix</button>`
        : '';
      return `<div class="ci-job">
        <span class="ci-job-icon" style="${jStyle}">${jIcon}</span>
        <span class="ci-job-name">${esc(j.name)}</span>
        <span class="ci-job-status" style="${jStyle}">${esc(jLabel)}</span>
        ${fixBtn}
      </div>`;
    }).join('');

    return `<div class="ci-run-group">
      <div class="ci-run-header">
        <span style="${runStyle}">${runIcon}</span>
        <a href="${esc(runUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.name ?? 'Workflow')}</a>
        <span style="${runStyle};font-size:11px;margin-left:auto">${esc(r.conclusion ?? r.status ?? '')}</span>
      </div>
      ${jobRows ? `<div class="ci-jobs">${jobRows}</div>` : ''}
    </div>`;
  }).join('');

  return `<div style="margin-bottom:12px">${badge}</div><div class="ci-runs">${groups}</div>`;
}

function ciStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    pending:['ci-pending','⟳ pending'], passed:['ci-passed','✓ passed'],
    failed:['ci-failed','✗ failed'],    no_runs:['ci-noruns','— no runs'],
  };
  const [cls, label] = map[status] ?? ['ci-noruns', esc(status)];
  return `<span class="ci-badge ${cls}">${label}</span>`;
}

async function loadCI(pr: PR): Promise<void> {
  ciLoaded = true;
  try {
    const { status, runs } = await api.getCI(pr.id);
    lastCIData = { status, runs };

    // Update tab badge regardless of active tab
    const badge = document.getElementById('ci-tab-badge');
    if (badge) {
      const badgeCls: Record<string, string> = { pending:'ci-pending', passed:'ci-passed', failed:'ci-failed' };
      badge.className = 'tab-badge ' + (badgeCls[status] ?? 'ci-noruns');
      badge.textContent = status === 'pending' ? '⟳' : status === 'passed' ? '✓' : status === 'failed' ? '✗' : '';
    }

    // Update tab content if CI tab is active
    if (activeTab === 'ci') {
      $('tab-content').innerHTML = ciRunsHTML(pr, status, runs);
      bindCIFixButtons(pr);
    }

    // Auto-poll while pending; stop when done
    if (status === 'pending') {
      if (!ciPollTimer) ciPollTimer = setInterval(() => void loadCI(pr), 15_000);
    } else {
      stopCIPoll();
    }
  } catch (e) {
    ciLoaded = false;
    stopCIPoll();
    if (activeTab === 'ci') {
      $('tab-content').innerHTML = `<div class="tab-empty" style="color:var(--red)">Failed: ${esc((e as Error).message)}</div>`;
    }
  }
}

function openFixTab(pr: PR, sessionId: string, jobName: string): void {
  const ft: FixTab = { sessionId, jobName, logs: [], status: 'running', followUpPrUrl: null, es: null };
  fixTabs.push(ft);
  const prTabs = fixTabsByPr.get(pr.id);
  if (prTabs && !prTabs.includes(ft)) prTabs.push(ft);
  renderTabBar(pr);
  selectTab(pr, sessionId);

  const es = new EventSource(`/api/fix/${sessionId}/logs`);
  ft.es = es;
  es.onmessage = (ev) => {
    const line = JSON.parse(ev.data) as string;
    if (line === '[done]') {
      es.close(); ft.es = null;
      api.fixStatus(sessionId).then(s => {
        ft.status = s.status as FixTabStatus;
        ft.followUpPrUrl = s.followUpPrUrl;
        renderTabBar(pr);
        if (activeTab === sessionId) $('tab-content').innerHTML = fixTabHTML(ft);
      }).catch(() => { ft.status = 'failed'; renderTabBar(pr); });
      return;
    }
    ft.logs.push(line);
    appendFixLog(sessionId, line);
  };
  es.onerror = () => { es.close(); ft.es = null; ft.status = 'failed'; renderTabBar(pr); };
}

function bindCIFixButtons(pr: PR): void {
  $('tab-content').querySelectorAll<HTMLButtonElement>('.ci-fix-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const jobName = btn.dataset.jobName!;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const { sessionId } = await api.fixCIJob(pr.id, jobName);
        openFixTab(pr, sessionId, jobName);

        toast(`CI fix started for "${jobName}"`, 'info');
      } catch (e) {
        toast(`CI fix failed: ${(e as Error).message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    });
  });
}

// ── Diff ──────────────────────────────────────────────────────────
async function loadDiff(pr: PR): Promise<void> {
  diffLoaded = true;
  try {
    const { diff, files } = await api.getDiff(pr.id);
    if (activeTab === 'diff') {
      $('tab-content').innerHTML = renderDiff(diff, files, pr.url);
    }
    if (files.length) {
      const adds = files.reduce((s, f) => s + f.additions, 0);
      const dels = files.reduce((s, f) => s + f.deletions, 0);
      const badge = document.getElementById('diff-tab-badge');
      if (badge) badge.innerHTML = `<span class="add">+${adds}</span> <span class="del">-${dels}</span>`;
    }
  } catch (e) {
    diffLoaded = false;
    if (activeTab === 'diff') {
      $('tab-content').innerHTML = `<div class="tab-empty" style="color:var(--red)">Failed: ${esc((e as Error).message)}</div>`;
    }
  }
}

// ── Action bar ────────────────────────────────────────────────────
function renderActions(pr: PR): void {
  // fix-merge: CI failing — block merge. merge-fix: safe to merge (Merge button + Merge+Fix button).
  const cat = pr.latest_review?.category;
  const canMerge = cat === 'auto-merge' || cat === 'merge-fix';
  const needsCI  = !!(pr.pending_approval || pr.external_stage === 'awaiting_approval');
  $('action-bar').innerHTML = `
    <button class="btn btn-success" ${canMerge ? '' : 'disabled'} data-act="merge">Merge</button>
    ${cat === 'merge-fix' ? `<button class="btn btn-primary" data-act="merge-and-fix">🔀 Merge + Fix</button>` : ''}
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
    case 'merge-and-fix': {
      const isMergeAndFix = act === 'merge-and-fix';
      try {
        const { sessionId } = isMergeAndFix
          ? await api.mergeAndFix(pr.id)
          : await api.autofix(pr.id);
        openFixTab(pr, sessionId, isMergeAndFix ? 'post-merge fix' : 'autofix');
        toast(isMergeAndFix ? 'PR merged — autofix running' : 'Autofix started', 'info');
        if (isMergeAndFix) { await fetchPRs(); }
      } catch (e) { toast(`Failed: ${(e as Error).message}`, 'error'); }
      break;
    }

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
  fixTabs = [];  // clear local reference; sessions live on in fixTabsByPr
  $('detail-empty').style.display = '';
  $('detail-content').style.display = 'none';
}

function refreshDetail(): void {
  if (!selId) return;
  const pr = prs.find(p => p.id === selId);
  if (!pr) return;
  renderHeader(pr);
  renderActions(pr);
  // Re-render tab content for the active tab (review data may have changed)
  if (activeTab === 'review') $('tab-content').innerHTML = reviewTabHTML(pr);
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

$<HTMLInputElement>('pr-search').addEventListener('input', (e) => {
  curSearch = (e.target as HTMLInputElement).value;
  renderList();
});
// Clear search when Escape pressed inside the box
$<HTMLInputElement>('pr-search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    (e.target as HTMLInputElement).value = '';
    curSearch = '';
    renderList();
  }
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

// ── Daemon log overlay ────────────────────────────────────────────
interface LogLine { ts: string; level: string; msg: string }

let logOverlayES: EventSource | null = null;

function openLogOverlay(): void {
  const overlay = $('log-overlay');
  const scrim   = $('log-overlay-scrim');
  overlay.classList.add('open');
  scrim.classList.add('open');

  const body = $('log-overlay-body');

  // Load historical lines
  fetch('/api/logs')
    .then(r => r.json())
    .then((lines: LogLine[]) => {
      body.innerHTML = '';
      lines.forEach(l => appendLogLine(l));
      body.scrollTop = body.scrollHeight;
    })
    .catch(() => {});

  // Stream live
  if (!logOverlayES) {
    logOverlayES = new EventSource('/api/logs/stream');
    logOverlayES.onmessage = (ev) => {
      const line = JSON.parse(ev.data) as LogLine;
      appendLogLine(line);
      const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
      if (atBottom) body.scrollTop = body.scrollHeight;
    };
  }
}

function closeLogOverlay(): void {
  $('log-overlay').classList.remove('open');
  $('log-overlay-scrim').classList.remove('open');
}

function appendLogLine(l: LogLine): void {
  const body = $('log-overlay-body');
  const ts  = l.ts ? new Date(l.ts).toLocaleTimeString() : '';
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${esc(ts)}</span>` +
    `<span class="log-lvl ${esc(l.level)}">${esc(l.level)}</span>` +
    `<span class="log-msg">${esc(l.msg)}</span>`;
  body.appendChild(div);
}

$('log-toggle').addEventListener('click', () => {
  $('log-overlay').classList.contains('open') ? closeLogOverlay() : openLogOverlay();
});
$('log-overlay-close').addEventListener('click', closeLogOverlay);
$('log-overlay-scrim').addEventListener('click', closeLogOverlay);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('log-overlay').classList.contains('open')) closeLogOverlay();
});

// ── Boot ──────────────────────────────────────────────────────────
void fetchPRs();
void fetchStatus();
connectSSE();
setInterval(() => void fetchStatus(), 30_000);
