export function renderUI(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PR Auto-Reviewer</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #0d1117;
  --bg2:       #161b22;
  --bg3:       #21262d;
  --border:    #30363d;
  --text:      #e6edf3;
  --text-dim:  #8b949e;
  --accent:    #388bfd;
  --accent-dim:#1f6feb;
  --green:     #3fb950;
  --yellow:    #d29922;
  --orange:    #db6d28;
  --red:       #f85149;
  --purple:    #bc8cff;
  --radius:    6px;
  --font-mono: 'SF Mono','Fira Code','Cascadia Code',monospace;
}

body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
       background: var(--bg); color: var(--text); height: 100vh; overflow: hidden;
       display: flex; flex-direction: column; font-size: 14px; line-height: 1.5; }

/* Top bar */
#topbar { display:flex; align-items:center; gap:12px; padding:8px 16px;
          background:var(--bg2); border-bottom:1px solid var(--border); flex-shrink:0; }
#topbar h1 { font-size:15px; font-weight:600; }
.sep { flex:1; }
#status-dot { width:8px; height:8px; border-radius:50%; background:var(--text-dim); }
#status-dot.live  { background:var(--green); }
#status-dot.error { background:var(--red); }
#status-label,#last-poll { font-size:12px; color:var(--text-dim); }

/* Layout */
#main { display:flex; flex:1; overflow:hidden; }

/* Sidebar */
#sidebar { width:360px; min-width:260px; display:flex; flex-direction:column;
           border-right:1px solid var(--border); background:var(--bg2); flex-shrink:0; }
#filters { display:flex; gap:4px; padding:10px 12px; flex-wrap:wrap;
           border-bottom:1px solid var(--border); }
.filter-btn { background:none; border:1px solid var(--border); color:var(--text-dim);
              border-radius:20px; padding:3px 10px; font-size:12px; cursor:pointer; transition:all .15s; }
.filter-btn:hover { border-color:var(--accent); color:var(--text); }
.filter-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
#repo-select { background:var(--bg3); border:1px solid var(--border); color:var(--text);
               border-radius:20px; padding:3px 10px 3px 10px; font-size:12px; cursor:pointer;
               outline:none; margin-left:auto; max-width:200px; }
#repo-select:focus { border-color:var(--accent); }
#repo-select option { background:var(--bg2); }
#pr-list { flex:1; overflow-y:auto; }
#pr-list::-webkit-scrollbar { width:5px; }
#pr-list::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
.pr-item { padding:11px 14px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .1s; }
.pr-item:hover { background:var(--bg3); }
.pr-item.selected { background:var(--bg3); border-left:3px solid var(--accent); padding-left:11px; }
.pr-item-top { display:flex; align-items:center; gap:5px; margin-bottom:4px; }
.pr-repo   { font-size:11px; color:var(--text-dim); font-family:var(--font-mono); }
.pr-num    { font-size:11px; color:var(--accent); font-family:var(--font-mono); }
.pr-badges { margin-left:auto; display:flex; gap:3px; flex-shrink:0; }
.pr-title  { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pr-meta   { font-size:11px; color:var(--text-dim); margin-top:2px; }
.empty-state { padding:40px 20px; text-align:center; color:var(--text-dim); font-size:13px; line-height:1.8; }

/* Badges */
.badge { display:inline-flex; align-items:center; padding:1px 7px;
         border-radius:20px; font-size:11px; font-weight:500; }
.b-auto    { background:rgba(63,185,80,.15);  color:var(--green);  border:1px solid rgba(63,185,80,.3); }
.b-attn    { background:rgba(210,153,34,.15); color:var(--yellow); border:1px solid rgba(210,153,34,.3); }
.b-chng    { background:rgba(219,109,40,.15); color:var(--orange); border:1px solid rgba(219,109,40,.3); }
.b-block   { background:rgba(248,81,73,.15);  color:var(--red);    border:1px solid rgba(248,81,73,.3); }
.b-pend    { background:rgba(210,153,34,.15); color:var(--yellow); border:1px solid rgba(210,153,34,.3); }
.b-ext     { background:rgba(188,140,255,.15);color:var(--purple); border:1px solid rgba(188,140,255,.3); }
.b-gray    { background:var(--bg3); color:var(--text-dim); border:1px solid var(--border); }

/* Detail */
#detail { flex:1; display:flex; flex-direction:column; overflow:hidden; }
#detail-empty { flex:1; display:flex; align-items:center; justify-content:center;
                color:var(--text-dim); font-size:14px; }
#detail-content { flex:1; display:flex; flex-direction:column; overflow:hidden; }
#detail-header { padding:14px 20px; border-bottom:1px solid var(--border); background:var(--bg2); flex-shrink:0; }
#detail-header h2 { font-size:16px; font-weight:600; margin-bottom:6px; line-height:1.4; }
#detail-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.mpill { font-size:12px; color:var(--text-dim); }
.mpill a { color:var(--accent); text-decoration:none; }
.mpill a:hover { text-decoration:underline; }
#detail-scroll { flex:1; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:14px; }
#detail-scroll::-webkit-scrollbar { width:5px; }
#detail-scroll::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
.section { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
.sec-hdr { padding:7px 14px; font-size:11px; font-weight:700; color:var(--text-dim);
           text-transform:uppercase; letter-spacing:.06em; background:var(--bg3);
           border-bottom:1px solid var(--border); }
.sec-body { padding:12px 14px; }
.desc-text { font-size:13px; white-space:pre-wrap; word-break:break-word;
             max-height:180px; overflow-y:auto; line-height:1.6; color:var(--text); }
.desc-text::-webkit-scrollbar { width:4px; }
.desc-text::-webkit-scrollbar-thumb { background:var(--border); }
.rev-top { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.rev-conf { font-size:12px; color:var(--text-dim); }
.rev-summary { font-size:13px; color:var(--text); line-height:1.6; margin-bottom:10px; }
.notes { list-style:none; display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
.notes li { font-size:13px; padding-left:14px; position:relative; line-height:1.5; }
.notes li::before { content:"•"; position:absolute; left:3px; color:var(--text-dim); }
.chg-item { border:1px solid var(--border); border-radius:var(--radius); padding:9px 12px; margin-bottom:7px; }
.chg-file { font-family:var(--font-mono); font-size:12px; color:var(--accent); margin-bottom:3px; }
.chg-desc { font-size:13px; margin-bottom:4px; }
.chg-sug  { font-size:12px; color:var(--text-dim); font-family:var(--font-mono);
             background:var(--bg3); padding:5px 8px; border-radius:4px; white-space:pre-wrap; word-break:break-word; }

/* Diff */
.diff-toggle { width:100%; background:none; border:none; text-align:left; cursor:pointer;
               padding:7px 14px; font-size:11px; font-weight:700; color:var(--text-dim);
               text-transform:uppercase; letter-spacing:.06em; background:var(--bg3);
               border-bottom:1px solid var(--border); display:flex; align-items:center; gap:6px; }
.diff-toggle:hover { color:var(--text); }
.diff-toggle .arrow { transition:transform .2s; display:inline-block; }
.diff-toggle.open .arrow { transform:rotate(90deg); }
.diff-body { display:none; overflow-x:auto; }
.diff-body.open { display:block; }
.diff-file-hdr { font-family:var(--font-mono); font-size:12px; font-weight:600;
                 color:var(--text); background:var(--bg3); padding:6px 12px;
                 border-bottom:1px solid var(--border); border-top:1px solid var(--border);
                 margin-top:4px; }
.diff-file-hdr:first-child { margin-top:0; border-top:none; }
.diff-table { width:100%; border-collapse:collapse; font-family:var(--font-mono); font-size:12px; }
.diff-table td { padding:1px 8px; white-space:pre; vertical-align:top; line-height:1.6; }
.diff-ln { color:var(--text-dim); user-select:none; min-width:40px; text-align:right;
           border-right:1px solid var(--border); padding-right:10px; }
.d-add  { background:rgba(63,185,80,.1); color:var(--green); }
.d-del  { background:rgba(248,81,73,.1); color:var(--red); }
.d-hunk { background:rgba(56,139,253,.07); color:var(--accent); }
.d-ctx  { color:var(--text-dim); }
.diff-stats { font-size:11px; color:var(--text-dim); padding:4px 12px;
              border-top:1px solid var(--border); }
.diff-stats .add { color:var(--green); }
.diff-stats .del { color:var(--red); }
.diff-loading { padding:20px; text-align:center; color:var(--text-dim); font-size:13px; }
.diff-truncated { padding:6px 12px; font-size:12px; color:var(--yellow);
                  border-top:1px solid var(--border); background:rgba(210,153,34,.07); }

/* Action bar */
#action-bar { padding:10px 20px; background:var(--bg2); border-top:1px solid var(--border);
              display:flex; align-items:center; gap:7px; flex-wrap:wrap; flex-shrink:0; }
.btn { display:inline-flex; align-items:center; gap:5px; padding:6px 13px;
       border-radius:var(--radius); font-size:13px; font-weight:500; cursor:pointer;
       border:1px solid var(--border); background:var(--bg3); color:var(--text);
       transition:all .12s; white-space:nowrap; }
.btn:hover:not(:disabled) { background:var(--bg); border-color:var(--text-dim); }
.btn:disabled { opacity:.4; cursor:not-allowed; }
.btn-primary { background:var(--accent-dim); border-color:var(--accent); color:#fff; }
.btn-primary:hover:not(:disabled) { background:var(--accent); }
.btn-danger  { background:rgba(248,81,73,.1);  border-color:var(--red);    color:var(--red); }
.btn-warning { background:rgba(210,153,34,.1); border-color:var(--yellow); color:var(--yellow); }
.btn-success { background:rgba(63,185,80,.1);  border-color:var(--green);  color:var(--green); }
.btn-danger:hover:not(:disabled)  { background:rgba(248,81,73,.2); }
.btn-warning:hover:not(:disabled) { background:rgba(210,153,34,.2); }
.btn-success:hover:not(:disabled) { background:rgba(63,185,80,.2); }
.spinner { width:12px; height:12px; border:2px solid currentColor; border-top-color:transparent;
           border-radius:50%; animation:spin .6s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

/* Modal */
#modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none;
                 align-items:center; justify-content:center; z-index:100; }
#modal-overlay.open { display:flex; }
.modal { background:var(--bg2); border:1px solid var(--border); border-radius:8px;
         padding:20px; width:480px; max-width:90vw; }
.modal h3 { font-size:15px; font-weight:600; margin-bottom:8px; }
.modal p  { font-size:13px; color:var(--text-dim); margin-bottom:12px; line-height:1.6; }
.modal textarea { width:100%; background:var(--bg); border:1px solid var(--border); color:var(--text);
                  padding:8px 10px; border-radius:var(--radius); font-size:13px; font-family:inherit;
                  resize:vertical; min-height:80px; margin-bottom:12px; }
.modal textarea:focus { outline:none; border-color:var(--accent); }
.modal-footer { display:flex; gap:8px; justify-content:flex-end; }

/* Toasts */
#toasts { position:fixed; bottom:20px; right:20px; display:flex; flex-direction:column;
          gap:7px; z-index:200; pointer-events:none; }
.toast { padding:9px 15px; border-radius:var(--radius); font-size:13px; font-weight:500;
         border:1px solid; animation:fadeIn .2s; max-width:340px; }
.t-ok   { background:rgba(63,185,80,.12);  border-color:var(--green);  color:var(--green); }
.t-err  { background:rgba(248,81,73,.12);  border-color:var(--red);    color:var(--red); }
.t-info { background:rgba(56,139,253,.12); border-color:var(--accent); color:var(--accent); }
@keyframes fadeIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; } }
</style>
</head>
<body>

<div id="topbar">
  <h1>⚡ PR Auto-Reviewer</h1>
  <div class="sep"></div>
  <span id="last-poll"></span>
  <span id="status-dot"></span>
  <span id="status-label">Connecting…</span>
</div>

<div id="main">
  <div id="sidebar">
    <div id="filters">
      <button class="filter-btn active" data-f="all">All</button>
      <button class="filter-btn" data-f="auto-merge">✓ Auto-merge</button>
      <button class="filter-btn" data-f="needs-attention">👀 Attention</button>
      <button class="filter-btn" data-f="needs-changes">⚠ Changes</button>
      <button class="filter-btn" data-f="block">✗ Block</button>
      <select id="repo-select" title="Filter by repository"></select>
    </div>
    <div id="pr-list"><div class="empty-state">Loading…</div></div>
  </div>
  <div id="detail">
    <div id="detail-empty">Select a PR to view details</div>
    <div id="detail-content" style="display:none;flex:1;flex-direction:column;overflow:hidden">
      <div id="detail-header"><h2 id="dh-title"></h2><div id="detail-meta"></div></div>
      <div id="detail-scroll"></div>
      <div id="action-bar"></div>
    </div>
  </div>
</div>

<div id="modal-overlay">
  <div class="modal">
    <h3 id="m-title"></h3>
    <p id="m-desc"></p>
    <textarea id="m-input" rows="3"></textarea>
    <div class="modal-footer">
      <button class="btn" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-ok">Submit</button>
    </div>
  </div>
</div>
<div id="toasts"></div>

<script>
// All dynamic content is inserted via textContent or explicitly escaped.
// innerHTML is only used with markup built from our own templates (no user data unescaped).
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let prs = [], selId = null, curFilter = 'all', curRepo = 'all';

// ─── Toast ────────────────────────────────────────────────────────
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = 'toast t-' + {success:'ok',error:'err',info:'info'}[type];
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ─── Modal ────────────────────────────────────────────────────────
let modalResolve = null;
function modal(title, desc, placeholder) {
  $('m-title').textContent = title;
  $('m-desc').textContent = desc;
  const inp = $('m-input');
  inp.placeholder = placeholder;
  inp.value = '';
  $('modal-overlay').classList.add('open');
  inp.focus();
  return new Promise(res => { modalResolve = res; });
}
function closeModal(val) {
  $('modal-overlay').classList.remove('open');
  if (modalResolve) { modalResolve(val ?? null); modalResolve = null; }
}
$('m-cancel').onclick = () => closeModal(null);
$('m-ok').onclick = () => closeModal($('m-input').value);
$('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(null); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(null); });

// ─── API ──────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? {'Content-Type':'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Badges ───────────────────────────────────────────────────────
function catBadge(cat) {
  if (!cat) return '<span class="badge b-gray">⏳ pending</span>';
  const m = {'auto-merge':['b-auto','✓ auto-merge'],'needs-attention':['b-attn','👀 attention'],
              'needs-changes':['b-chng','⚠ changes'],'block':['b-block','✗ block']};
  const [cls,lbl] = m[cat] || ['b-gray', esc(cat)];
  return \`<span class="badge \${cls}">\${lbl}</span>\`;
}

// ─── PR List ──────────────────────────────────────────────────────
async function fetchPRs() {
  try {
    prs = await api('GET', '/prs');
    updateRepoDropdown();
    renderList();
  } catch(e) {
    $('pr-list').innerHTML = '<div class="empty-state">Error loading PRs:<br>' + esc(e.message) + '</div>';
  }
}

function updateRepoDropdown() {
  const sel = $('repo-select');
  const repos = [...new Set(prs.map(p => \`\${p.owner}/\${p.repo}\`))].sort();
  const prev = sel.value;
  sel.innerHTML = '<option value="all">All repos</option>' +
    repos.map(r => \`<option value="\${esc(r)}">\${esc(r)}</option>\`).join('');
  // Preserve selection if repo still exists
  sel.value = repos.includes(prev) ? prev : 'all';
  if (sel.value !== prev) curRepo = 'all';
}

function renderList() {
  const list = prs
    .filter(p => curFilter === 'all' || p.latest_review?.category === curFilter)
    .filter(p => curRepo === 'all' || \`\${p.owner}/\${p.repo}\` === curRepo);
  const el = $('pr-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state">' +
      (prs.length ? 'No PRs match this filter.' : 'No open PRs.<br>Is the daemon running?') + '</div>';
    return;
  }
  // Build rows safely: esc() all user content
  el.innerHTML = list.map(pr => {
    const cat = pr.latest_review?.category;
    const ext  = pr.is_external    ? '<span class="badge b-ext">ext</span>' : '';
    const appr = pr.pending_approval ? '<span class="badge b-pend">⏸</span>' : '';
    return \`<div class="pr-item\${pr.id===selId?' selected':''}" data-id="\${pr.id}">
      <div class="pr-item-top">
        <span class="pr-repo">\${esc(pr.owner)}/\${esc(pr.repo)}</span>
        <span class="pr-num">#\${pr.number}</span>
        <div class="pr-badges">\${ext}\${appr}\${catBadge(cat)}</div>
      </div>
      <div class="pr-title">\${esc(pr.title)}</div>
      <div class="pr-meta">by \${esc(pr.author)} · \${ago(pr.updated_at)}</div>
    </div>\`;
  }).join('');
  el.querySelectorAll('.pr-item').forEach(row =>
    row.addEventListener('click', () => openPR(parseInt(row.dataset.id))));
}

// ─── Detail ───────────────────────────────────────────────────────
function openPR(id) {
  selId = id;
  diffLoaded = false;
  renderList();
  const pr = prs.find(p => p.id === id);
  if (!pr) return;
  $('detail-empty').style.display = 'none';
  const dc = $('detail-content');
  dc.style.display = 'flex';
  dc.style.flexDirection = 'column';
  dc.style.overflow = 'hidden';
  renderHeader(pr);
  renderBody(pr);
  renderActions(pr);
}

function renderHeader(pr) {
  $('dh-title').textContent = pr.title;
  const cat = pr.latest_review?.category;
  const extB  = pr.is_external ? \`<span class="mpill"><span class="badge b-ext">external</span></span>\` : '';
  const apprB = pr.pending_approval ? \`<span class="mpill"><span class="badge b-pend">⏸ workflows need approval</span></span>\` : '';
  const ciB   = pr.external_stage === 'ci_pending' ? \`<span class="mpill"><span class="badge b-attn">⟳ CI running</span></span>\` : '';
  $('detail-meta').innerHTML =
    \`<span class="mpill">\${catBadge(cat)}</span>\${extB}\${apprB}\${ciB}
     <span class="mpill">by <strong>\${esc(pr.author)}</strong></span>
     <span class="mpill">base: <code>\${esc(pr.base_branch)}</code></span>
     <span class="mpill">sha: <code>\${esc(pr.head_sha.slice(0,7))}</code></span>
     <span class="mpill"><a href="\${esc(pr.url)}" target="_blank" rel="noopener noreferrer">Open in GitHub ↗</a></span>\`;
}

function renderBody(pr) {
  const ds = $('detail-scroll');
  const rev = pr.latest_review;
  let html = '';

  if (pr.body?.trim()) {
    html += \`<div class="section"><div class="sec-hdr">Description</div>
      <div class="sec-body"><div class="desc-text">\${esc(pr.body)}</div></div></div>\`;
  }

  if (rev) {
    const conf = Math.round((rev.confidence ?? 0) * 100);
    const cost = rev.cost_usd != null ? \` · \$\${rev.cost_usd.toFixed(4)}\` : '';
    const notes = (Array.isArray(rev.notes) ? rev.notes : [])
      .map(n => \`<li>\${esc(n)}</li>\`).join('');
    const changes = (Array.isArray(rev.suggested_changes) ? rev.suggested_changes : [])
      .map(sc => \`<div class="chg-item">
        <div class="chg-file">\${esc(sc.file)}</div>
        <div class="chg-desc">\${esc(sc.description)}</div>
        \${sc.suggestion ? \`<div class="chg-sug">\${esc(sc.suggestion)}</div>\` : ''}
      </div>\`).join('');
    html += \`<div class="section"><div class="sec-hdr">Review</div><div class="sec-body">
      <div class="rev-top">\${catBadge(rev.category)}<span class="rev-conf">confidence: \${conf}%\${cost}</span></div>
      <div class="rev-summary">\${esc(rev.summary)}</div>
      \${notes ? \`<ul class="notes">\${notes}</ul>\` : ''}
      \${changes || ''}
    </div></div>\`;
  } else {
    html += \`<div class="section"><div class="sec-body" style="color:var(--text-dim);font-size:13px">No review yet — daemon is processing.</div></div>\`;
  }

  // Diff section — collapsed by default, loads lazily on expand
  html += \`<div class="section" id="diff-section">
    <button class="diff-toggle" id="diff-toggle" onclick="toggleDiff(\${pr.id})">
      <span class="arrow">▶</span> Diff
      <span id="diff-stats-inline" style="font-weight:400;margin-left:4px"></span>
    </button>
    <div class="diff-body" id="diff-body">
      <div class="diff-loading">Loading diff…</div>
    </div>
  </div>\`;

  ds.innerHTML = html;
}

function renderActions(pr) {
  const bar = $('action-bar');
  const canMerge = pr.latest_review?.category === 'auto-merge';
  const needsCI  = pr.pending_approval || pr.external_stage === 'awaiting_approval';
  // Build button list — no user content in button labels
  const btns = [
    \`<button class="btn btn-success" \${canMerge?'':'disabled'} data-act="merge">Merge</button>\`,
    \`<button class="btn" data-act="comment">Comment</button>\`,
    \`<button class="btn" data-act="ai-comment">✨ AI Comment</button>\`,
    \`<button class="btn" data-act="review">Re-review</button>\`,
    \`<button class="btn" data-act="custom-review">Custom prompt…</button>\`,
    \`<button class="btn btn-warning" \${pr.latest_review?'':'disabled'} data-act="autofix">Autofix</button>\`,
    needsCI ? \`<button class="btn btn-warning" data-act="approve-ci">⏸ Approve CI</button>\` : '',
    \`<button class="btn btn-danger" data-act="close">Close</button>\`,
  ];
  bar.innerHTML = btns.join('');
  bar.querySelectorAll('[data-act]').forEach(btn =>
    btn.addEventListener('click', e => handleAction(e, pr.id, btn.dataset.act)));
}

// ─── Diff ─────────────────────────────────────────────────────────
let diffLoaded = false;

async function toggleDiff(id) {
  const toggle = $('diff-toggle');
  const body   = $('diff-body');
  if (!toggle || !body) return;

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
  try {
    const { diff, files } = await api('GET', \`/prs/\${id}/diff\`);
    renderDiff(diff, files);
  } catch(e) {
    body.innerHTML = \`<div class="diff-loading" style="color:var(--red)">Failed to load diff: \${esc(e.message)}</div>\`;
    diffLoaded = false;
  }
}

function renderDiff(rawDiff, files) {
  const body = $('diff-body');
  const statsEl = $('diff-stats-inline');
  if (!body) return;

  const MAX_LINES = 2000;
  const lines = rawDiff.split('\\n');
  const truncated = lines.length > MAX_LINES;
  const visibleLines = truncated ? lines.slice(0, MAX_LINES) : lines;

  // Summary stats from file list
  if (files?.length && statsEl) {
    const adds = files.reduce((s, f) => s + (f.additions || 0), 0);
    const dels = files.reduce((s, f) => s + (f.deletions || 0), 0);
    statsEl.innerHTML = \`— <span class="add">+\${adds}</span> <span class="del">-\${dels}</span> across \${files.length} file\${files.length !== 1 ? 's' : ''}\`;
  }

  // Build table rows — all user content via esc()
  let html = '<table class="diff-table">';
  let lineNum = { old: 0, new: 0 };
  let inFile = false;

  for (const line of visibleLines) {
    if (line.startsWith('diff --git ')) {
      // Extract filename from "diff --git a/foo b/foo"
      const m = line.match(/diff --git a\\/(.+) b\\/.+/);
      const fname = m ? m[1] : line.slice(11);
      html += \`</table><div class="diff-file-hdr">\${esc(fname)}</div><table class="diff-table">\`;
      inFile = true;
      lineNum = { old: 0, new: 0 };
    } else if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) { lineNum.old = parseInt(m[1]) - 1; lineNum.new = parseInt(m[2]) - 1; }
      html += \`<tr class="d-hunk"><td class="diff-ln"></td><td class="diff-ln"></td><td>\${esc(line)}</td></tr>\`;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum.new++;
      html += \`<tr class="d-add"><td class="diff-ln"></td><td class="diff-ln">\${lineNum.new}</td><td>\${esc(line)}</td></tr>\`;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lineNum.old++;
      html += \`<tr class="d-del"><td class="diff-ln">\${lineNum.old}</td><td class="diff-ln"></td><td>\${esc(line)}</td></tr>\`;
    } else if (line.startsWith('\\\\') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('Binary')) {
      // skip meta lines from table but don't show blank row
    } else if (inFile) {
      lineNum.old++; lineNum.new++;
      html += \`<tr class="d-ctx"><td class="diff-ln">\${lineNum.old}</td><td class="diff-ln">\${lineNum.new}</td><td>\${esc(line)}</td></tr>\`;
    }
  }
  html += '</table>';

  body.innerHTML = html +
    (truncated ? \`<div class="diff-truncated">⚠ Diff truncated at \${MAX_LINES} lines. <a href="\${esc(prs.find(p=>p.id===selId)?.url ?? '')+'/files'}" target="_blank" rel="noopener noreferrer">View full diff on GitHub ↗</a></div>\` : '');
}

// ─── Actions ──────────────────────────────────────────────────────
async function handleAction(e, id, act) {
  const btn = e.currentTarget;
  const orig = btn.innerHTML;
  const spin = () => { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; };
  const unspin = () => { btn.disabled = false; btn.innerHTML = orig; };

  if (act === 'merge') {
    if (!confirm('Merge this PR?')) return;
    spin();
    try { await api('POST', \`/prs/\${id}/merge\`); toast('PR merged', 'success'); afterAction(); }
    catch(e) { toast('Merge failed: ' + e.message, 'error'); unspin(); }

  } else if (act === 'comment') {
    const body = await modal('Post a Comment', 'Write a comment to post on the PR.', 'Leave a comment…');
    if (!body?.trim()) return;
    try { await api('POST', \`/prs/\${id}/comment\`, {body}); toast('Comment posted', 'success'); }
    catch(e) { toast('Failed: ' + e.message, 'error'); }

  } else if (act === 'ai-comment') {
    const instruction = await modal('Generate AI Comment',
      'Describe what the comment should focus on, or submit empty to summarise the review findings.',
      'e.g. Focus on the security concerns in the auth module…');
    if (instruction === null) return;
    spin();
    try {
      const r = await api('POST', \`/prs/\${id}/generate-comment\`, {instruction});
      toast('Comment posted', 'success');
    } catch(e) { toast('Failed: ' + e.message, 'error'); }
    unspin();

  } else if (act === 'review') {
    try { await api('POST', \`/prs/\${id}/review\`); toast('Re-review queued', 'info'); }
    catch(e) { toast('Failed: ' + e.message, 'error'); }

  } else if (act === 'custom-review') {
    const prompt = await modal('Custom Re-review Prompt',
      'Add extra instructions for Claude. Submit empty for a plain re-review.',
      'e.g. Focus on security and error handling…');
    if (prompt === null) return;
    try { await api('POST', \`/prs/\${id}/review\`, {prompt}); toast('Re-review queued', 'info'); }
    catch(e) { toast('Failed: ' + e.message, 'error'); }

  } else if (act === 'approve-ci') {
    spin();
    try { await api('POST', \`/prs/\${id}/approve-ci\`); toast('CI approved', 'success'); await fetchPRs(); refreshDetail(); }
    catch(e) { toast('Failed: ' + e.message, 'error'); }
    unspin();

  } else if (act === 'autofix') {
    try { await api('POST', \`/prs/\${id}/autofix\`); toast('Autofix started — follow-up PR will be created', 'info'); }
    catch(e) { toast('Failed: ' + e.message, 'error'); }

  } else if (act === 'close') {
    if (!confirm('Close this PR?')) return;
    spin();
    try { await api('POST', \`/prs/\${id}/close\`); toast('PR closed', 'success'); afterAction(); }
    catch(e) { toast('Failed: ' + e.message, 'error'); unspin(); }
  }
}

function afterAction() {
  selId = null;
  $('detail-empty').style.display = '';
  $('detail-content').style.display = 'none';
  fetchPRs();
}

function refreshDetail() {
  if (!selId) return;
  const pr = prs.find(p => p.id === selId);
  if (pr) { renderHeader(pr); renderBody(pr); renderActions(pr); }
}

// ─── Filters ──────────────────────────────────────────────────────
$('filters').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  curFilter = btn.dataset.f;
  renderList();
});

$('repo-select').addEventListener('change', e => {
  curRepo = e.target.value;
  renderList();
});

// ─── SSE ──────────────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/events');
  const dot = $('status-dot'), lbl = $('status-label');
  es.onopen  = () => { dot.className = 'live'; lbl.textContent = 'Live'; };
  es.onerror = () => { dot.className = 'error'; lbl.textContent = 'Reconnecting…'; };
  es.onmessage = async ev => {
    let e; try { e = JSON.parse(ev.data); } catch { return; }
    if (e.type === 'poll:complete') { await fetchPRs(); fetchStatus(); }
    if (e.type === 'review:complete') {
      toast(\`Review: \${e.owner}/\${e.repo}#\${e.number} → \${e.category}\`, 'info');
      await fetchPRs();
      if (selId === e.prId) refreshDetail();
    }
    if (e.type === 'approval:needed') {
      toast(\`⏸ \${e.owner}/\${e.repo}#\${e.number} needs CI approval\`, 'info');
      await fetchPRs();
    }
  };
}

// ─── Status ───────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const s = await api('GET', '/status');
    $('last-poll').textContent = s.lastPollAt ? 'Last poll: ' + ago(s.lastPollAt) : '';
  } catch(_) {}
}

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ─── Boot ─────────────────────────────────────────────────────────
fetchPRs();
fetchStatus();
connectSSE();
setInterval(fetchStatus, 30000);
</script>
</body>
</html>`;
}
