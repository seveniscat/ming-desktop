import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CodingAgent, AgentLLM, CodingAgentCallbacks } from './CodingAgent';
import { CodingToolSet } from './CodingToolSet';
import { ToolCall } from '@shared/types';

// execute_command 不参与本测试；stub 即可。
const stubExecutor = {
  executeCommand: async () => ({ exitCode: 0, stdout: '', stderr: '', duration: 0, success: true }),
} as any;

const NO_CB: CodingAgentCallbacks = { onChunk: () => {}, onToolEvent: () => {} };

describe('coding agent end-to-end (real toolset + real FS)', () => {
  let ws: string;
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-e2e-'));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  /** 用脚本化 LLM 模拟一个真实 provider 的多轮工具调用序列。 */
  function scriptedLLM(script: { fullContent: string; toolCalls?: ToolCall[] }[]): AgentLLM {
    let i = 0;
    return {
      async chat() {
        return script[i++] ?? { fullContent: '' };
      },
    };
  }

  it('reads a file, edits it across turns — file actually changes on disk', async () => {
    await fs.writeFile(path.join(ws, 'config.ts'), 'export const PORT = 3000;\n');

    const llm = scriptedLLM([
      {
        fullContent: '先读一下配置文件',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'config.ts' }) } },
        ],
      },
      {
        fullContent: '把端口改成 8080',
        toolCalls: [
          { id: 'c2', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ file_path: 'config.ts', old_string: '3000', new_string: '8080' }) } },
        ],
      },
      { fullContent: '已把 PORT 改为 8080。' },
    ]);

    const tools = new CodingToolSet(ws, stubExecutor);
    const agent = new CodingAgent(llm, tools, ws, 'm', 'sys', 10);

    const events: any[] = [];
    const res = await agent.run('把端口改成 8080', { ...NO_CB, onToolEvent: (e) => events.push(e) }, undefined);

    // 三轮：read -> edit -> 结束
    expect(res.turns).toBe(3);
    // 文件确实被改了
    expect(await fs.readFile(path.join(ws, 'config.ts'), 'utf-8')).toBe('export const PORT = 8080;\n');
    // 两个工具都执行成功
    const results = events.filter((e) => e.event === 'tool_result');
    expect(results.map((e) => e.name)).toEqual(['read_file', 'edit_file']);
    expect(results.every((e: any) => !e.isError)).toBe(true);
  });

  it('agent recovers when edit target is ambiguous (tool error → retry with more context)', async () => {
    await fs.writeFile(path.join(ws, 'dup.txt'), 'x\nx\n');

    const llm = scriptedLLM([
      {
        fullContent: '',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ file_path: 'dup.txt', old_string: 'x', new_string: 'y' }) } },
        ],
      },
      // 第二轮：模型看到「多处匹配」错误，补充上下文重试
      {
        fullContent: '',
        toolCalls: [
          { id: 'c2', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ file_path: 'dup.txt', old_string: 'x\nx', new_string: 'y\ny' }) } },
        ],
      },
      { fullContent: 'done' },
    ]);

    const tools = new CodingToolSet(ws, stubExecutor);
    const agent = new CodingAgent(llm, tools, ws, 'm', 'sys', 10);
    const events: any[] = [];
    await agent.run('edit', { ...NO_CB, onToolEvent: (e) => events.push(e) }, undefined);

    const results = events.filter((e) => e.event === 'tool_result');
    // 第一次 edit：多处匹配，工具以 JSON {success:false} 返回错误（非抛异常），错误文本进 result
    expect(results[0].result).toMatch(/matched 2 times|multiple/i);
    // 第二次 edit：补充上下文后成功，文件被改
    expect(results[1].isError).toBe(false);
    expect(await fs.readFile(path.join(ws, 'dup.txt'), 'utf-8')).toBe('y\ny\n');
  });
});
