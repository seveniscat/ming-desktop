import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CodingToolSet } from './CodingToolSet';

// execute_command needs an ExecutorService; a stub is enough for unit tests.
const stubExecutor = {
  executeCommand: async () => ({ exitCode: 0, stdout: '', stderr: '', duration: 0, success: true }),
} as any;

describe('CodingToolSet', () => {
  let ws: string;
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), 'cts-'));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  it('exposes the 8 coding tools', () => {
    const set = new CodingToolSet(ws, stubExecutor);
    const names = set.getDefinitions().map((d) => d.function.name).sort();
    expect(names).toEqual(
      ['edit_file', 'execute_command', 'glob', 'grep', 'list_directory', 'read_file', 'search_files', 'write_file'],
    );
  });

  it('binds a workspace-aware tool to the workspace', async () => {
    await fs.writeFile(path.join(ws, 'a.ts'), 'x');
    const set = new CodingToolSet(ws, stubExecutor);
    const res = JSON.parse(await set.execute('glob', { pattern: '*.ts' }, { workspace: ws }));
    expect((res.matches as string[]).some((m) => m.endsWith('a.ts'))).toBe(true);
  });

  it('read_file resolves a relative path against the workspace', async () => {
    await fs.writeFile(path.join(ws, 'rel.txt'), 'hello');
    const set = new CodingToolSet(ws, stubExecutor);
    const res = JSON.parse(await set.execute('read_file', { path: 'rel.txt' }, { workspace: ws }));
    expect(res.content).toBe('hello');
  });

  it('throws on unknown tool', async () => {
    const set = new CodingToolSet(ws, stubExecutor);
    await expect(set.execute('nope', {}, { workspace: ws })).rejects.toThrow(/Unknown tool/);
  });
});
