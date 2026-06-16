import { describe, it, expect } from 'vitest';
import { CodingAgent, AgentLLM, ToolRuntime, CodingAgentCallbacks } from './CodingAgent';
import { ToolDefinition, ToolCall } from '@shared/types';

function fakeLLM(responses: { fullContent: string; toolCalls?: ToolCall[] }[]): AgentLLM {
  let i = 0;
  return {
    async chat(_messages, _tools, _model) {
      return responses[i++] ?? { fullContent: '' };
    },
  };
}

function fakeTools(defs: ToolDefinition[], handler: (name: string, params: Record<string, any>) => string): ToolRuntime {
  return {
    getDefinitions: () => defs,
    execute: async (name, params) => handler(name, params),
  };
}

const NO_CB = { onChunk: () => {}, onToolEvent: () => {} } as CodingAgentCallbacks;

describe('CodingAgent', () => {
  it('returns text in a single turn when no tools called', async () => {
    const llm = fakeLLM([{ fullContent: 'hello world' }]);
    const tools = fakeTools([], () => 'x');
    const agent = new CodingAgent(llm, tools, '/ws', 'm', 'sys');
    const chunks: string[] = [];
    const res = await agent.run('hi', { ...NO_CB, onChunk: (t) => chunks.push(t) }, undefined as any);
    expect(res.fullContent).toBe('hello world');
    expect(res.turns).toBe(1);
    expect(chunks.join('')).toBe('hello world');
  });

  it('runs a tool round-trip and backfills structured tool results', async () => {
    const llm = fakeLLM([
      { fullContent: 'let me read', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a"}' } }] },
      { fullContent: 'done' },
    ]);
    let executed: any = null;
    const tools = fakeTools([{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: {} } } }], (name, params) => {
      executed = { name, params };
      return 'FILE CONTENTS';
    });
    const agent = new CodingAgent(llm, tools, '/ws', 'm', 'sys');
    const events: any[] = [];
    const res = await agent.run('read a', { ...NO_CB, onToolEvent: (e) => events.push(e) }, undefined as any);
    expect(res.turns).toBe(2);
    expect(executed).toEqual({ name: 'read_file', params: { file_path: 'a' } });
    const starts = events.filter((e) => e.event === 'tool_start');
    const results = events.filter((e) => e.event === 'tool_result');
    expect(starts[0].name).toBe('read_file');
    expect(results[0].result).toBe('FILE CONTENTS');
    expect(results[0].isError).toBe(false);
  });

  it('backfills tool errors and continues the loop', async () => {
    const llm = fakeLLM([
      { fullContent: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'bad', arguments: '{}' } }] },
      { fullContent: 'recovered' },
    ]);
    const tools = fakeTools([{ type: 'function', function: { name: 'bad', parameters: { type: 'object', properties: {} } } }], () => {
      throw new Error('boom');
    });
    const agent = new CodingAgent(llm, tools, '/ws', 'm', 'sys');
    const events: any[] = [];
    const res = await agent.run('go', { ...NO_CB, onToolEvent: (e) => events.push(e) }, undefined as any);
    const errResult = events.find((e) => e.event === 'tool_result');
    expect(errResult.isError).toBe(true);
    expect(errResult.result).toMatch(/boom/);
    expect(res.fullContent).toBe('recovered');
  });

  it('emits max_turns and stops at the limit', async () => {
    const responses = Array.from({ length: 10 }, () => ({
      fullContent: '',
      toolCalls: [{ id: 'c', type: 'function' as const, function: { name: 't', arguments: '{}' } }],
    }));
    const llm = fakeLLM(responses);
    const tools = fakeTools([{ type: 'function', function: { name: 't', parameters: { type: 'object', properties: {} } } }], () => 'ok');
    const agent = new CodingAgent(llm, tools, '/ws', 'm', 'sys', 3);
    const events: any[] = [];
    const res = await agent.run('loop', { ...NO_CB, onToolEvent: (e) => events.push(e) }, undefined as any);
    expect(res.turns).toBe(3);
    expect(events.some((e) => e.event === 'max_turns')).toBe(true);
  });

  it('aborts when signal fires', async () => {
    const ctrl = new AbortController();
    const llm = fakeLLM([{ fullContent: '', toolCalls: [{ id: 'c', type: 'function', function: { name: 't', arguments: '{}' } }] }]);
    const tools = fakeTools([{ type: 'function', function: { name: 't', parameters: { type: 'object', properties: {} } } }], () => {
      ctrl.abort();
      return 'ok';
    });
    const agent = new CodingAgent(llm, tools, '/ws', 'm', 'sys', 5);
    const res = await agent.run('go', NO_CB, ctrl.signal);
    expect(res.turns).toBeLessThanOrEqual(5);
  });
});
