/**
 * 检测输入框光标处是否处于 @ 引用触发态。
 * 触发条件：光标前最近一个 '@' 位于行首或空白符之后，
 * 且 '@' 与光标之间没有空白/第二个 '@'（排除邮箱等场景）。
 */
export interface MentionTriggerState {
  active: boolean;
  /** '@' 后已输入的过滤词 */
  query: string;
  /** '@' 在文本中的起始位置，用于选中后替换；未激活为 -1 */
  tokenStart: number;
}

const INACTIVE: MentionTriggerState = { active: false, query: '', tokenStart: -1 };

export function parseMentionTrigger(text: string, caret: number): MentionTriggerState {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = before.lastIndexOf('@');
  if (at === -1) return INACTIVE;

  const prev = at === 0 ? ' ' : before[at - 1];
  if (!/\s/.test(prev)) return INACTIVE;

  const query = before.slice(at + 1);
  if (query.includes('@') || /\s/.test(query)) return INACTIVE;

  return { active: true, query, tokenStart: at };
}
