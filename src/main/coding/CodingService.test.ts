import { describe, it, expect } from 'vitest';
import { CodingService } from './CodingService';

// Stubs — CodingService lifecycle (create/list/dispose) doesn't touch the LLM or executor.
const fakeLLM = {
  getDefaultProviderId: () => 'p1',
  listProviders: () => [{ id: 'p1', models: ['m1'] }],
} as any;
const fakeExecutor = {} as any;

describe('CodingService lifecycle', () => {
  it('create / list / dispose a session', () => {
    const svc = new CodingService(fakeLLM, fakeExecutor);
    const id = svc.create('/ws', 'm1');
    expect(id).toMatch(/^coding-/);
    expect(svc.list().map((s) => s.id)).toContain(id);
    svc.dispose(id);
    expect(svc.list().map((s) => s.id)).not.toContain(id);
  });

  it('create throws when no providers configured', () => {
    const svc = new CodingService(
      { getDefaultProviderId: () => null, listProviders: () => [] } as any,
      fakeExecutor,
    );
    expect(() => svc.create('/ws', 'm1')).toThrow(/No LLM providers/);
  });

  it('stop/dispose on unknown session are no-ops', () => {
    const svc = new CodingService(fakeLLM, fakeExecutor);
    expect(() => svc.stop('nope')).not.toThrow();
    expect(() => svc.dispose('nope')).not.toThrow();
  });
});
