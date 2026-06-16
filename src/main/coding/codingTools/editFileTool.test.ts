import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createEditFileTool } from './editFileTool';

describe('edit_file', () => {
  let dir: string;
  const tool = createEditFileTool();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function write(name: string, content: string) {
    const p = path.join(dir, name);
    await fs.writeFile(p, content, 'utf-8');
    return p;
  }

  async function run(file: string, oldStr: string, newStr: string) {
    return JSON.parse(
      await tool.handler(
        { file_path: file, old_string: oldStr, new_string: newStr },
        { workspace: dir },
      ),
    );
  }

  it('replaces a unique single match', async () => {
    const f = await write('a.ts', 'foo\nbar\nbaz');
    const res = await run(f, 'bar', 'BAR');
    expect(res.success).toBe(true);
    expect(await fs.readFile(f, 'utf-8')).toBe('foo\nBAR\nbaz');
  });

  it('errors on zero matches with context hint', async () => {
    const f = await write('a.ts', 'foo\nbar');
    const res = await run(f, 'nope', 'x');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no match/i);
  });

  it('errors on multiple matches demanding more context', async () => {
    const f = await write('a.ts', 'dup\nline\ndup');
    const res = await run(f, 'dup', 'x');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/multiple|2/i);
  });

  it('supports multi-line (cross-line) replacement', async () => {
    const f = await write('a.ts', 'start\nmiddle\nend');
    const res = await run(f, 'start\nmiddle', 'BEGIN');
    expect(res.success).toBe(true);
    expect(await fs.readFile(f, 'utf-8')).toBe('BEGIN\nend');
  });

  it('creates file when old_string is empty and file missing', async () => {
    const f = path.join(dir, 'new.ts');
    const res = await run(f, '', 'hello');
    expect(res.success).toBe(true);
    expect(await fs.readFile(f, 'utf-8')).toBe('hello');
  });
});
