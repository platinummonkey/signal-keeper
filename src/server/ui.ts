/** Live log viewer for a CI fix session. Opened in a new tab when Fix is clicked. */
export function fixLogPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Signal Keeper — CI Fix</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0d1117; --bg2: #161b22; --border: #30363d;
  --text: #e6edf3; --dim: #8b949e; --green: #3fb950;
  --yellow: #d29922; --red: #f85149; --accent: #388bfd;
  --font-mono: 'SF Mono','Fira Code','Cascadia Code',monospace;
}
body { font-family: var(--font-mono); background: var(--bg); color: var(--text);
       height: 100vh; display: flex; flex-direction: column; font-size: 13px; }
#header { padding: 10px 16px; background: var(--bg2); border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
#header h1 { font-size: 14px; font-weight: 600; }
#status { padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.status-running { background: rgba(56,139,253,.15); color: var(--accent); border: 1px solid rgba(56,139,253,.3); }
.status-done    { background: rgba(63,185,80,.15);  color: var(--green);  border: 1px solid rgba(63,185,80,.3); }
.status-failed  { background: rgba(248,81,73,.15);  color: var(--red);    border: 1px solid rgba(248,81,73,.3); }
#meta { color: var(--dim); font-size: 12px; margin-left: auto; }
#pr-link { color: var(--accent); text-decoration: none; }
#pr-link:hover { text-decoration: underline; }
#log { flex: 1; overflow-y: auto; padding: 14px 16px; white-space: pre-wrap;
       word-break: break-word; line-height: 1.6; }
#log::-webkit-scrollbar { width: 6px; }
#log::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.log-line { display: block; }
.log-line.stderr { color: var(--dim); }
.log-line.done   { color: var(--green); font-weight: 600; margin-top: 8px; }
.log-line.failed { color: var(--red);   font-weight: 600; margin-top: 8px; }
#footer { padding: 8px 16px; background: var(--bg2); border-top: 1px solid var(--border);
          font-size: 11px; color: var(--dim); display: flex; gap: 16px; flex-shrink: 0; }
#follow-up { display: none; }
#follow-up a { color: var(--green); }
</style>
</head>
<body>
<div id="header">
  <h1>⚡ Signal Keeper — CI Fix</h1>
  <span id="status" class="status-running">⟳ running</span>
  <span id="meta"></span>
</div>
<pre id="log"></pre>
<div id="footer">
  <span>Scroll to bottom to follow live output</span>
  <span id="follow-up">Follow-up PR: <a id="pr-link" href="#" target="_blank"></a></span>
</div>
<script>
const params = new URLSearchParams(location.search);
const sessionId = params.get('session');

if (!sessionId) {
  document.getElementById('log').textContent = 'No session ID provided.';
} else {
  // Load session meta
  fetch('/api/fix/' + sessionId)
    .then(r => r.json())
    .then(s => {
      document.title = 'CI Fix: ' + s.jobName;
      document.querySelector('h1').textContent = '⚡ CI Fix: ' + s.jobName;
      document.getElementById('meta').textContent =
        s.owner + '/' + s.repo + ' #' + s.prNumber;
    })
    .catch(() => {});

  const log = document.getElementById('log');
  const status = document.getElementById('status');
  let autoScroll = true;

  log.addEventListener('scroll', () => {
    autoScroll = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  });

  function appendLine(text) {
    if (text === '[done]') return;
    const span = document.createElement('span');
    span.className = 'log-line' +
      (text.startsWith('[stderr]') ? ' stderr' :
       text.startsWith('✓') ? ' done' :
       text.startsWith('✗') ? ' failed' : '');
    span.textContent = text + '\\n';
    log.appendChild(span);
    if (autoScroll) log.scrollTop = log.scrollHeight;
  }

  function setDone(followUpUrl) {
    status.className = 'status-done';
    status.textContent = '✓ done';
    if (followUpUrl) {
      const fu = document.getElementById('follow-up');
      const a  = document.getElementById('pr-link');
      fu.style.display = '';
      a.href = followUpUrl;
      a.textContent = followUpUrl;
    }
  }

  function setFailed() {
    status.className = 'status-failed';
    status.textContent = '✗ failed';
  }

  const es = new EventSource('/api/fix/' + sessionId + '/logs');
  es.onmessage = (e) => {
    const line = JSON.parse(e.data);
    if (line === '[done]') {
      es.close();
      fetch('/api/fix/' + sessionId)
        .then(r => r.json())
        .then(s => {
          if (s.status === 'done') setDone(s.followUpPrUrl);
          else setFailed();
        });
      return;
    }
    appendLine(line);
  };
  es.onerror = () => { es.close(); setFailed(); };
}
</script>
</body>
</html>`;
}

/** Served when dist/client hasn't been built yet (e.g. after fresh clone). */
export function notBuiltPage(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Signal Keeper — not built</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3;
         display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .box { max-width: 480px; text-align: center; }
  h1 { font-size: 20px; margin-bottom: 12px; }
  p  { color: #8b949e; font-size: 14px; line-height: 1.6; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<div class="box">
  <h1>⚡ Signal Keeper</h1>
  <p>The browser UI hasn't been built yet.</p>
  <p>Run <code>npm run build</code> then restart, or use<br>
     <code>npm run dev</code> for the development server (port 5173).</p>
</div>
</body>
</html>`;
}
