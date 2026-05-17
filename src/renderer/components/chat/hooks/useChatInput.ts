import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { PromptSuggestion, PromptTemplate } from '../types';

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

export function useChatInput({
  promptTemplates,
  isLoading,
  onActivateSkill,
}: {
  promptTemplates: PromptTemplate[];
  isLoading: boolean;
  onActivateSkill?: (skillId: string) => void;
}) {
  const [input, setInput] = useState('');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [tools, setTools] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [pendingVariablePrompt, setPendingVariablePrompt] = useState<PromptSuggestion | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load tools and skills once
  useEffect(() => {
    window.electronAPI.tools.list().then((list: any[]) => {
      setTools(list.filter(t => t.is_enabled));
    }).catch(() => {});
    window.electronAPI.skills.list().then((list: any[]) => {
      setSkills(list.filter((s: any) => s.enabled));
    }).catch(() => {});
  }, []);

  const slashQuery = input.startsWith('/') ? input.slice(1).trim().toLowerCase() : null;

  const promptSuggestions = useMemo<PromptSuggestion[]>(() => {
    if (slashQuery === null) return [];

    const toolItems: PromptSuggestion[] = tools.map((tool) => ({
      id: `tool-${tool.name}`,
      name: tool.display_name || tool.name,
      trigger: tool.name,
      description: tool.description || '',
      content: `/${tool.name} `,
      type: 'tool' as const,
    }));

    const skillItems: PromptSuggestion[] = skills.map((skill) => ({
      id: `skill-${skill.id}`,
      name: skill.name,
      trigger: skill.name.toLowerCase(),
      description: skill.description || '',
      content: skill.prompt,
      type: 'skill' as const,
    }));

    const promptItems: PromptSuggestion[] = promptTemplates
      .filter((prompt) => prompt.enabled)
      .map<PromptSuggestion>((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        trigger: prompt.trigger || prompt.name.toLowerCase(),
        description: prompt.description,
        content: prompt.content,
        type: 'prompt' as const,
      }));

    const all = [...toolItems, ...skillItems, ...promptItems];
    if (!slashQuery) return all.slice(0, 10);

    return all
      .filter((item) => {
        const haystack = `${item.name} ${item.trigger} ${item.description}`.toLowerCase();
        return haystack.includes(slashQuery);
      })
      .slice(0, 10);
  }, [tools, skills, promptTemplates, slashQuery]);

  const promptMenuOpen = slashQuery !== null && promptSuggestions.length > 0 && !isLoading;

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [slashQuery]);

  const applyPromptSuggestion = useCallback((suggestion: PromptSuggestion) => {
    if (suggestion.type === 'skill') {
      const skillId = suggestion.id.replace('skill-', '');
      onActivateSkill?.(skillId);
      setInput('');
      requestAnimationFrame(() => inputRef.current?.focus());
      setSelectedPromptIndex(0);
      return;
    }

    const vars = extractVariables(suggestion.content);
    if (vars.length > 0 && suggestion.type === 'prompt') {
      setPendingVariablePrompt(suggestion);
    } else {
      setInput(suggestion.content);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setSelectedPromptIndex(0);
  }, [onActivateSkill]);

  const applyVariableValues = useCallback((values: Record<string, string>) => {
    if (!pendingVariablePrompt) return;
    let rendered = pendingVariablePrompt.content;
    for (const [key, value] of Object.entries(values)) {
      rendered = rendered.split(`{${key}}`).join(value);
    }
    setInput(rendered);
    setPendingVariablePrompt(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [pendingVariablePrompt]);

  const cancelVariableFill = useCallback(() => {
    setPendingVariablePrompt(null);
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
    pendingVariablePrompt,
    applyVariableValues,
    cancelVariableFill,
  };
}
