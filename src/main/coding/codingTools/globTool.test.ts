import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createGlobTool } from './globTool';

describe('glob', () => {
  let dir: string;
  const tool = createGlobTool();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-'));
    await fs.writeFile(path.join(dir, 'a.ts'), '');
    await fs.writeFile(path.join(dir, 'b.js'), '');
    await fs.mkdir(path.join(dir, 'sub'));
    await fs.writeFile(path.join(dir, 'sub', 'c.ts'), '');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function run(pattern: string) {
    return JSON.parse(await tool.handler({ pattern }, { workspace: dir }));
  }

  it('matches only root level with * (no segment crossing)', async () => {
    const res = await run('*.ts');
    expect(res.success).toBe(true);
    const names = (res.matches as string[]).map((p) => path.basename(p)).sort();
    expect(names).toEqual(['a.ts']);
  });

  it('matches recursively with **', async () => {
    const res = await run('**/*.ts');
    expect(res.success).toBe(true);
    const names = (res.matches as string[]).map((p) => path.basename(p)).sort();
    expect(names).toEqual(['a.ts', 'c.ts']);
  });

  it('matches a root-level file with ** and a different extension', async () => {
    const res = await run('**/*.js');
    expect(res.success).toBe(true);
    expect((res.matches as string[]).map((p) => path.basename(p))).toEqual(['b.js']);
  });
});
