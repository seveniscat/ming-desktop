import * as fs from 'fs/promises';
import { MentionReference, GitRefParams } from '@shared/types';

/** Git 引用的提交摘要（与日报管线返回的 JSON 字段对齐） */
export interface MentionCommit {
  hash: string;
  date: string;
  repo: string;
  subject: string;
}

/** 解析成功的引用上下文；text 为注入模型的正文 */
export interface ResolvedContext {
  ref: MentionReference;
  text: string;
  truncated?: boolean;
}

export interface MentionResolverDeps {
  getMemory: (id: string) => { content: string } | undefined;
  getSkillPrompt: (skillId: string) => string | undefined;
  getGitCommits: (
    params: GitRefParams,
  ) => Promise<{ commits: MentionCommit[]; repos: string[] }>;
}

const FILE_MAX_BYTES = 16 * 1024;
const GIT_MAX_COMMITS = 200;
const GIT_TIME_RANGES: GitRefParams['timeRange'][] = ['today', 'yesterday', 'week', 'custom'];

/**
 * 把 @ 引用解析为可注入的上下文文本。四类来源：
 * memory/skill 查注入依赖；file 直读磁盘（16KB 截断、拒二进制）；
 * git 走日报采集管线（上限 200 条）。单源失败不阻塞，以「来源不可用」占位。
 */
export class MentionResolver {
  constructor(private deps: MentionResolverDeps) {}

  async resolve(refs: MentionReference[]): Promise<ResolvedContext[]> {
    return Promise.all(
      refs.map((ref) =>
        this.resolveOne(ref).catch((e) => ({
          ref,
          text: `[来源不可用] ${e instanceof Error ? e.message : String(e)}`,
        })),
      ),
    );
  }

  private async resolveOne(ref: MentionReference): Promise<ResolvedContext> {
    switch (ref.kind) {
      case 'memory':
        return this.resolveMemory(ref);
      case 'skill':
        return this.resolveSkill(ref);
      case 'file':
        return this.resolveFile(ref);
      case 'git':
        return this.resolveGit(ref);
      default:
        throw new Error(`未知引用类型: ${ref.kind}`);
    }
  }

  private resolveMemory(ref: MentionReference): ResolvedContext {
    const memory = this.deps.getMemory(ref.id);
    if (!memory) throw new Error('记忆不存在或已删除');
    return { ref, text: memory.content };
  }

  private resolveSkill(ref: MentionReference): ResolvedContext {
    const prompt = this.deps.getSkillPrompt(ref.id);
    if (!prompt) throw new Error('技能不存在或未启用');
    return { ref, text: prompt };
  }

  private async resolveFile(ref: MentionReference): Promise<ResolvedContext> {
    const buf = await fs.readFile(ref.id);
    if (buf.includes(0)) throw new Error('二进制文件不支持引用');
    const truncated = buf.byteLength > FILE_MAX_BYTES;
    const slice = truncated ? buf.subarray(0, FILE_MAX_BYTES) : buf;
    return { ref, text: slice.toString('utf-8'), truncated };
  }

  private async resolveGit(ref: MentionReference): Promise<ResolvedContext> {
    const { commits } = await this.deps.getGitCommits(this.parseGitParams(ref));

    if (commits.length === 0) {
      return { ref, text: '该时间范围内没有提交' };
    }

    const truncated = commits.length > GIT_MAX_COMMITS;
    const list = truncated ? commits.slice(0, GIT_MAX_COMMITS) : commits;

    const byRepo = new Map<string, number>();
    for (const c of list) byRepo.set(c.repo, (byRepo.get(c.repo) ?? 0) + 1);
    const header = Array.from(byRepo.entries())
      .map(([repo, n]) => `${repo} (${n} commits)`)
      .join(', ');
    const lines = list.map((c) => `- ${c.hash.slice(0, 7)} [${c.repo}] ${c.date} ${c.subject}`);
    const text = [
      header,
      ...lines,
      ...(truncated ? [`[仅显示前 ${GIT_MAX_COMMITS} 条提交]`] : []),
    ].join('\n');

    return { ref, text, truncated };
  }

  private parseGitParams(ref: MentionReference): GitRefParams {
    const raw = ref.params ?? {};
    const timeRange = GIT_TIME_RANGES.includes(raw.timeRange as GitRefParams['timeRange'])
      ? (raw.timeRange as GitRefParams['timeRange'])
      : 'today';
    const params: GitRefParams = { timeRange };
    if (raw.since) params.since = raw.since;
    if (raw.until) params.until = raw.until;
    return params;
  }
}
