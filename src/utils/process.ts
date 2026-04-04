import { spawn, SpawnOptions } from 'child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function run(
  cmd: string,
  args: string[],
  opts: SpawnOptions & { input?: string; onOutput?: (line: string) => void } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const { input, onOutput, ...spawnOpts } = opts;
    const child = spawn(cmd, args, { ...spawnOpts, stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    const makeHandler = (buf: 'stdout' | 'stderr', prefix: string) => (d: Buffer) => {
      const chunk = d.toString();
      if (buf === 'stdout') stdout += chunk; else stderr += chunk;
      if (onOutput) chunk.split('\n').forEach(line => { if (line) onOutput(`${prefix}${line}`); });
    };

    child.stdout?.on('data', makeHandler('stdout', ''));
    child.stderr?.on('data', makeHandler('stderr', '[stderr] '));

    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      // Close stdin immediately — sends EOF without the 3s "no stdin data" wait,
      // while still leaving the pipe open long enough for the process to find
      // its positional arguments before reading stdin.
      child.stdin?.end();
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}
