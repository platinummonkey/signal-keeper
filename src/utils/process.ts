import { spawn, SpawnOptions } from 'child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function run(
  cmd: string,
  args: string[],
  opts: SpawnOptions & { input?: string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const { input, ...spawnOpts } = opts;
    const child = spawn(cmd, args, { ...spawnOpts, stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}
