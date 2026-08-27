import { useState, useEffect, useCallback } from 'react';
import type { MentionReference } from '../../../../shared/types';
import { parseMentionTrigger } from './mentionTrigger';

export interface MemoryItem {
  id: string;
  content: string;
  category?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  description?: string;
}

/**
 * Chat 输入框 @ 引用的状态机：
 * - 触发检测（parseMentionTrigger）驱动 Picker 开合与过滤词
 * - chips 为本次发送将携带的引用集合（去重、可移除、发送时一次性消费）
 * - 数据源在 Picker 打开时懒加载（记忆 + 技能）
 */
export function useMentions() {
  const [chips, setChips] = useState<MentionReference[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tokenStart, setTokenStart] = useState(-1);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);

  useEffect(() => {
    if (!pickerOpen) return;
    window.electronAPI?.memories
      ?.list()
      .then((list: any[]) => setMemories((list || []).slice(0, 100)))
      .catch(() => {});
    window.electronAPI?.skills
      ?.list()
      .then((list: any[]) => setSkills((list || []).filter((s) => s.enabled)))
      .catch(() => {});
  }, [pickerOpen]);

  /** composer onInput 时调用：text 为全文，caret 为光标位置 */
  const handleComposerInput = useCallback((text: string, caret: number) => {
    const state = parseMentionTrigger(text, caret);
    setPickerOpen(state.active);
    setQuery(state.query);
    setTokenStart(state.tokenStart);
  }, []);

  const addChip = useCallback((ref: MentionReference) => {
    setChips((prev) =>
      prev.some((c) => c.kind === ref.kind && c.id === ref.id) ? prev : [...prev, ref],
    );
  }, []);

  const removeChip = useCallback((ref: MentionReference) => {
    setChips((prev) => prev.filter((c) => !(c.kind === ref.kind && c.id === ref.id)));
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setQuery('');
  }, []);

  /** 发送时取走全部引用并清空（仅 composer 发送路径调用） */
  const consumeReferences = useCallback((): MentionReference[] | undefined => {
    if (chips.length === 0) return undefined;
    const refs = chips;
    setChips([]);
    return refs;
  }, [chips]);

  return {
    chips,
    addChip,
    removeChip,
    consumeReferences,
    pickerOpen,
    query,
    tokenStart,
    handleComposerInput,
    closePicker,
    memories,
    skills,
  };
}

export type MentionsController = ReturnType<typeof useMentions>;
