import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MentionResolver, buildReferenceBlock } from './MentionResolver';
import { MentionReference, GitRefParams } from '@shared/types';

// fake 依赖：记忆/技能查表，git 按需注入
const memories = new Map<string, { content: string }>();
const skills = new Map<string, string>();

function makeResolver(
  getGitCommits: (params: GitRefParams) => Promise<{ commits: any[]; repos: string[] }> = async () => ({
    commits: [],
    repos: [],
  }),
) {
  return new MentionResolver({
    getMemory: (id) => memories.get(id),
    getSkillPrompt: (id) => skills.get(id),
    getGitCommits,
  });
}

describe('MentionResolver', () => {
  let ws: string;
  beforeEach(async () => {
    memories.clear();
    skills.clear();
    ws = await fs.mkdtemp(path.join(os.tmpdir(), 'mention-test-'));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  describe('memory', () => {
    it('resolves memory content by id', async () => {
      memories.set('m1', { content: '用户偏好中文周报，按项目分组' });
      const [r] = await makeResolver().resolve([{ kind: 'memory', id: 'm1', label: '周报偏好' }]);
      expect(r.text).toBe('用户偏好中文周报，按项目分组');
      expect(r.truncated).toBeFalsy();
    });

    it('returns unavailable placeholder when memory is missing', async () => {
      const [r] = await makeResolver().resolve([{ kind: 'memory', id: 'gone', label: '已删除' }]);
      expect(r.text).toMatch(/来源不可用/);
    });
  });

  describe('skill', () => {
    it('resolves skill prompt', async () => {
      skills.set('s1', '你是周报生成专家…');
      const [r] = await makeResolver().resolve([{ kind: 'skill', id: 's1', label: '周报生成器' }]);
      expect(r.text).toBe('你是周报生成专家…');
    });

    it('returns unavailable placeholder when skill is missing', async () => {
      const [r] = await makeResolver().resolve([{ kind: 'skill', id: 'gone', label: '已删除' }]);
      expect(r.text).toMatch(/来源不可用/);
    });
  });

  describe('file', () => {
    it('reads a text file as context', async () => {
      const p = path.join(ws, 'note.md');
      await fs.writeFile(p, '# 项目纪要\n内容');
      const [r] = await makeResolver().resolve([{ kind: 'file', id: p, label: 'note.md' }]);
      expect(r.text).toContain('# 项目纪要');
      expect(r.truncated).toBeFalsy();
    });

    it('truncates files larger than 16KB and marks truncated', async () => {
      const p = path.join(ws, 'big.txt');
      await fs.writeFile(p, 'x'.repeat(17 * 1024));
      const [r] = await makeResolver().resolve([{ kind: 'file', id: p, label: 'big.txt' }]);
      expect(r.truncated).toBe(true);
      expect(r.text.length).toBe(16 * 1024);
    });

    it('rejects binary files', async () => {
      const p = path.join(ws, 'bin.dat');
      await fs.writeFile(p, Buffer.from([0x89, 0x50, 0x00, 0x4e]));
      const [r] = await makeResolver().resolve([{ kind: 'file', id: p, label: 'bin.dat' }]);
      expect(r.text).toMatch(/来源不可用/);
      expect(r.text).toMatch(/二进制/);
    });

    it('returns unavailable when file does not exist', async () => {
      const [r] = await makeResolver().resolve([
        { kind: 'file', id: path.join(ws, 'nope.txt'), label: 'nope.txt' },
      ]);
      expect(r.text).toMatch(/来源不可用/);
    });
  });

  describe('git', () => {
    const commit = (hash: string, repo: string, subject: string) => ({
      hash,
      date: '2026-08-27',
      repo,
      subject,
    });

    it('formats repo summary and commit lines', async () => {
      const resolver = makeResolver(async () => ({
        commits: [
          commit('abc1234567', 'repo-a', 'feat: 新功能'),
          commit('def1234567', 'repo-a', 'fix: 修复'),
          commit('fff1234567', 'repo-b', 'chore: 杂务'),
        ],
        repos: ['repo-a', 'repo-b'],
      }));
      const [r] = await resolver.resolve([
        { kind: 'git', id: 'commits', label: '今日提交', params: { timeRange: 'today' } },
      ]);
      expect(r.text).toContain('repo-a (2 commits)');
      expect(r.text).toContain('repo-b (1 commits)');
      expect(r.text).toContain('- abc1234 [repo-a] 2026-08-27 feat: 新功能');
      expect(r.truncated).toBeFalsy();
    });

    it('caps at 200 commits and marks truncated', async () => {
      const many = Array.from({ length: 230 }, (_, i) =>
        commit(`h${String(i).padStart(9, '0')}`, 'repo-a', `c${i}`),
      );
      const resolver = makeResolver(async () => ({ commits: many, repos: ['repo-a'] }));
      const [r] = await resolver.resolve([
        { kind: 'git', id: 'commits', label: '本周提交', params: { timeRange: 'week' } },
      ]);
      expect(r.truncated).toBe(true);
      expect(r.text).toContain('[仅显示前 200 条提交]');
      expect(r.text.match(/^- /gm)?.length).toBe(200);
    });

    it('reports empty range without error', async () => {
      const resolver = makeResolver(async () => ({ commits: [], repos: ['repo-a'] }));
      const [r] = await resolver.resolve([
        { kind: 'git', id: 'commits', label: '今日提交', params: { timeRange: 'today' } },
      ]);
      expect(r.text).toContain('没有提交');
    });

    it('defaults invalid timeRange to today and passes through since/until', async () => {
      let received: GitRefParams | undefined;
      const resolver = makeResolver(async (params) => {
        received = params;
        return { commits: [], repos: [] };
      });
      await resolver.resolve([
        {
          kind: 'git', id: 'commits', label: '自定义',
          params: { timeRange: 'bogus', since: '2026-08-01', until: '2026-08-15' },
        },
      ]);
      expect(received).toEqual({ timeRange: 'today', since: '2026-08-01', until: '2026-08-15' });
    });
  });

  it('a broken reference does not block the others', async () => {
    memories.set('m1', { content: '记忆内容' });
    skills.set('s1', '技能提示词');
    const results = await makeResolver().resolve([
      { kind: 'memory', id: 'm1', label: '好记忆' },
      { kind: 'file', id: path.join(ws, 'missing.txt'), label: '坏文件' },
      { kind: 'skill', id: 's1', label: '好技能' },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].text).toBe('记忆内容');
    expect(results[1].text).toMatch(/来源不可用/);
    expect(results[2].text).toBe('技能提示词');
  });

  it('empty input resolves to empty output', async () => {
    expect(await makeResolver().resolve([])).toEqual([]);
  });
});

describe('buildReferenceBlock', () => {
  const ref = (kind: MentionReference['kind'], label: string): MentionReference => ({
    kind, id: 'x', label,
  });

  it('returns null for empty input', () => {
    expect(buildReferenceBlock([])).toBeNull();
  });

  it('wraps each resolved context as a ### section inside referenced-context tags', () => {
    const block = buildReferenceBlock([
      { ref: ref('memory', '周报偏好'), text: '偏好中文' },
      { ref: ref('git', '本周提交'), text: 'repo-a (2 commits)' },
    ]);
    expect(block).toContain('<referenced-context>');
    expect(block).toContain('</referenced-context>');
    expect(block).toContain('### @周报偏好\n偏好中文');
    expect(block).toContain('### @本周提交\nrepo-a (2 commits)');
    // 顺序保持
    expect(block!.indexOf('周报偏好')).toBeLessThan(block!.indexOf('本周提交'));
  });

  it('keeps the first section intact and truncates from the back when over budget', () => {
    const block = buildReferenceBlock(
      [
        { ref: ref('memory', '甲'), text: 'A'.repeat(100) },
        { ref: ref('file', '乙'), text: 'B'.repeat(100) },
      ],
      160, // 只够装下第一段 + 第二段的一部分
    );
    expect(block).toContain('A'.repeat(100)); // 第一段完整
    expect(block).toContain('[已截断]'); // 第二段被截
    expect(block).not.toContain('B'.repeat(100));
  });

  it('drops later sections with a placeholder once the budget is exhausted', () => {
    const block = buildReferenceBlock(
      [
        { ref: ref('memory', '甲'), text: 'A'.repeat(200) },
        { ref: ref('file', '乙'), text: 'B'.repeat(10) },
        { ref: ref('git', '丙'), text: 'C'.repeat(10) },
      ],
      120, // 第一段截断后预算耗尽
    );
    expect(block).toContain('[已截断]');
    expect(block).toContain('[超出上下文预算，未注入]');
    expect(block).not.toContain('CCCC');
  });
});
