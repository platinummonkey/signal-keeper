/** Served when dist/client hasn't been built yet (e.g. after fresh clone). */
export function notBuiltPage(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PR Auto-Reviewer — not built</title>
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
  <h1>⚡ PR Auto-Reviewer</h1>
  <p>The browser UI hasn't been built yet.</p>
  <p>Run <code>npm run build</code> then restart, or use<br>
     <code>npm run dev</code> for the development server (port 5173).</p>
</div>
</body>
</html>`;
}
