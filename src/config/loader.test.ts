import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, addTarget } from './loader.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `pr-reviewer-test-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates template and exits when no config exists', () => {
    const configPath = join(dir, 'config.yaml');
    // process.exit is called — catch it
    const origExit = process.exit.bind(process);
    let exitCode: number | undefined;
    process.exit = ((code: number) => { exitCode = code; throw new Error('exit'); }) as never;

    try {
      loadConfig(configPath);
    } catch (e: unknown) {
      if ((e as Error).message !== 'exit') throw e;
    } finally {
      process.exit = origExit;
    }

    expect(exitCode).toBe(0);
    expect(existsSync(configPath)).toBe(true);
  });

  it('throws when targets list is empty', () => {
    const configPath = join(dir, 'config.yaml');
    writeFileSync(configPath, `
github:
  tokenCommand: "echo token"
targets: []
`);
    expect(() => loadConfig(configPath)).toThrow(/No targets configured/);
  });

  it('throws on schema validation failure', () => {
    const configPath = join(dir, 'config.yaml');
    writeFileSync(configPath, `
targets:
  - repo: "no-slash"
    filter: all
`);
    expect(() => loadConfig(configPath)).toThrow(/Config validation failed/);
  });

  it('loads a valid config and expands ~ in workDir', () => {
    const configPath = join(dir, 'config.yaml');
    writeFileSync(configPath, `
targets:
  - repo: owner/repo
    filter: all
workDir: ~/my-work-dir
`);
    const config = loadConfig(configPath);
    expect(config.targets).toHaveLength(1);
    expect(config.workDir).not.toContain('~');
    expect(config.workDir).toContain('my-work-dir');
  });
});

describe('addTarget', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates config file if missing and adds target', () => {
    const configPath = join(dir, 'config.yaml');
    addTarget({ repo: 'owner/repo', filter: 'all' }, configPath);
    const config = loadConfig(configPath);
    expect(config.targets).toHaveLength(1);
    expect((config.targets[0] as { repo: string }).repo).toBe('owner/repo');
  });

  it('appends to an existing targets list', () => {
    const configPath = join(dir, 'config.yaml');
    writeFileSync(configPath, `targets:\n  - repo: owner/first\n    filter: all\n`);
    addTarget({ repo: 'owner/second', filter: 'assigned' }, configPath);
    const config = loadConfig(configPath);
    expect(config.targets).toHaveLength(2);
  });

  it('rejects a duplicate repo', () => {
    const configPath = join(dir, 'config.yaml');
    addTarget({ repo: 'owner/repo', filter: 'all' }, configPath);
    expect(() => addTarget({ repo: 'owner/repo', filter: 'all' }, configPath))
      .toThrow(/already in your targets/);
  });

  it('rejects a duplicate org', () => {
    const configPath = join(dir, 'config.yaml');
    addTarget({ org: 'my-org', filter: 'all' }, configPath);
    expect(() => addTarget({ org: 'my-org', filter: 'team', team: 'eng' }, configPath))
      .toThrow(/already in your targets/);
  });
});
