import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { PromptSuggestion, PromptTemplate } from '../types';

export function useChatInput({
  promptTemplates,
  isLoading,
}: {
  promptTemplates: PromptTemplate[];
  isLoading: boolean;
}) {
  const [input, setInput] = useState('');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const slashQuery = input.startsWith('/') ? input.slice(1).trim().toLowerCase() : null;

  const promptSuggestions = useMemo<PromptSuggestion[]>(() => {
    if (slashQuery === null) return [];

    const userPrompts = promptTemplates
      .filter((prompt) => prompt.enabled)
      .map<PromptSuggestion>((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        trigger: prompt.trigger,
        description: prompt.description,
        content: prompt.content,
        type: 'prompt',
      }));

    const all = [...userPrompts];
    if (!slashQuery) return all.slice(0, 8);

    return all
      .filter((item) => {
        const haystack = `${item.name} ${item.trigger} ${item.description}`.toLowerCase();
        return haystack.includes(slashQuery);
      })
      .slice(0, 8);
  }, [promptTemplates, slashQuery]);

  const promptMenuOpen = slashQuery !== null && promptSuggestions.length > 0 && !isLoading;

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [slashQuery]);

  const applyPromptSuggestion = useCallback((suggestion: PromptSuggestion) => {
    // 如果内容是完整的命令（如 /日报），直接发送而不是留在输入框
    // 否则只填入内容部分（去掉 /）
    if (suggestion.content.startsWith('/')) {
      // 保留内容在输入框，但让菜单消失：添加一个空格
      setInput(suggestion.content + ' ');
    } else {
      setInput(suggestion.content);
    }
    setSelectedPromptIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return {
    input,
    setInput,
    inputRef,
    slashQuery,
    promptSuggestions,
    promptMenuOpen,
    selectedPromptIndex,
    setSelectedPromptIndex,
    applyPromptSuggestion,
  };
}
