import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createGrepTool } from './grepTool';

describe('grep', () => {
  let dir: string;
  const tool = createGrepTool();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-'));
    await fs.writeFile(path.join(dir, 'a.ts'), 'const x = 1;\nconst hello = "world";\nconsole.log(hello);\n');
    await fs.writeFile(path.join(dir, 'b.md'), '# Title\nhello world\n');
    await fs.mkdir(path.join(dir, 'sub'));
    await fs.writeFile(path.join(dir, 'sub', 'c.ts'), 'return hello;\n');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function run(args: Record<string, any>) {
    return JSON.parse(await tool.handler(args, { workspace: dir }));
  }

  it('finds pattern across files, returns file:line:content', async () => {
    const res = await run({ pattern: 'hello' });
    expect(res.success).toBe(true);
    const hits = res.matches as { path: string; line: number; content: string }[];
    const rels = hits.map((h) => ({ file: path.relative(dir, h.path), line: h.line }));
    expect(rels.sort((a, b) => a.file.localeCompare(b.file))).toEqual([
      { file: 'a.ts', line: 2 },
      { file: 'a.ts', line: 3 },
      { file: 'b.md', line: 2 },
      { file: 'sub/c.ts', line: 1 },
    ]);
  });

  it('supports case-insensitive flag', async () => {
    const res = await run({ pattern: 'HELLO', case_insensitive: true });
    const hits = res.matches as any[];
    expect(hits.length).toBeGreaterThan(0);
  });

  it('respects include glob filter', async () => {
    const res = await run({ pattern: 'hello', include: '*.ts' });
    const hits = res.matches as { path: string }[];
    const files = hits.map((h) => path.relative(dir, h.path));
    // *.ts matches root a.ts but NOT sub/c.ts (single * does not cross /)
    // a.ts has 2 matches of 'hello', so we expect it twice
    expect(files.sort()).toEqual(['a.ts', 'a.ts']);
  });
});
