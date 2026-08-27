import { describe, it, expect } from 'vitest';
import { parseMentionTrigger } from './mentionTrigger';

describe('parseMentionTrigger', () => {
  it('activates right after "@" at start', () => {
    expect(parseMentionTrigger('@', 1)).toEqual({ active: true, query: '', tokenStart: 0 });
  });

  it('activates with query after "@"', () => {
    expect(parseMentionTrigger('帮我写周报 @Git', 11)).toEqual({
      active: true, query: 'Git', tokenStart: 6,
    });
  });

  it('activates when "@" follows whitespace mid-text', () => {
    const s = 'hello @记忆';
    expect(parseMentionTrigger(s, s.length)).toEqual({ active: true, query: '记忆', tokenStart: 6 });
  });

  it('stays inactive inside emails (no whitespace before @)', () => {
    const s = 'contact me a@b.com';
    expect(parseMentionTrigger(s, s.length).active).toBe(false);
  });

  it('deactivates once a space follows the query', () => {
    const s = '@周报 帮我写';
    expect(parseMentionTrigger(s, s.length).active).toBe(false);
  });

  it('deactivates when caret is before the "@"', () => {
    const s = 'see @file';
    expect(parseMentionTrigger(s, 3).active).toBe(false);
  });

  it('uses the nearest "@" when multiple exist', () => {
    const s = '@a @b';
    expect(parseMentionTrigger(s, s.length)).toEqual({ active: true, query: 'b', tokenStart: 3 });
  });

  it('deactivates with no "@" at all', () => {
    expect(parseMentionTrigger('plain text', 10).active).toBe(false);
  });
});
