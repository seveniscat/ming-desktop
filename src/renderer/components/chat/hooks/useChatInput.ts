import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { PromptSuggestion, PromptTemplate } from '../types';
import type { SkillParameter } from '../../../../shared/types';

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

interface PendingParameterSkill {
  skillId: string;
  skillName: string;
  parameters: SkillParameter[];
  autoMessage?: string;
}

export function useChatInput({
  promptTemplates,
  isLoading,
  onActivateSkill,
}: {
  promptTemplates: PromptTemplate[];
  isLoading: boolean;
  onActivateSkill?: (skillId: string, autoMessage?: string) => void;
}) {
  const [input, setInput] = useState('');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [skills, setSkills] = useState<any[]>([]);
  const [pendingVariablePrompt, setPendingVariablePrompt] = useState<PromptSuggestion | null>(null);
  const [pendingParameterSkill, setPendingParameterSkill] = useState<PendingParameterSkill | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load skills once
  useEffect(() => {
    window.electronAPI.skills.list().then((list: any[]) => {
      setSkills(list.filter((s: any) => s.enabled));
    }).catch(() => {});
  }, []);

  const slashQuery = input.startsWith('/') ? input.slice(1).trim().toLowerCase() : null;

  const promptSuggestions = useMemo<PromptSuggestion[]>(() => {
    if (slashQuery === null) return [];

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

    const all = [...skillItems, ...promptItems];
    if (!slashQuery) return all.slice(0, 10);

    return all
      .filter((item) => {
        const haystack = `${item.name} ${item.trigger} ${item.description}`.toLowerCase();
        return haystack.includes(slashQuery);
      })
      .slice(0, 10);
  }, [skills, promptTemplates, slashQuery]);

  const promptMenuOpen = slashQuery !== null && promptSuggestions.length > 0 && !isLoading;

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [slashQuery]);

  const applyPromptSuggestion = useCallback((suggestion: PromptSuggestion) => {
    if (suggestion.type === 'skill') {
      const skillId = suggestion.id.replace('skill-', '');
      const skill = skills.find((s: any) => s.id === skillId);
      if (skill?.parameters?.length > 0) {
        setPendingParameterSkill({
          skillId,
          skillName: skill.name,
          parameters: skill.parameters,
          autoMessage: skill.autoMessage,
        });
      } else {
        onActivateSkill?.(skillId, skill?.autoMessage);
      }
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
  }, [onActivateSkill, skills]);

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

  const applySkillParameters = useCallback((values: Record<string, string>) => {
    if (!pendingParameterSkill) return;
    let message = pendingParameterSkill.autoMessage || '';
    for (const [key, value] of Object.entries(values)) {
      message = message.split(`{${key}}`).join(value);
    }
    onActivateSkill?.(pendingParameterSkill.skillId, message || undefined);
    setPendingParameterSkill(null);
  }, [pendingParameterSkill, onActivateSkill]);

  const cancelSkillParameters = useCallback(() => {
    setPendingParameterSkill(null);
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
    pendingParameterSkill,
    applySkillParameters,
    cancelSkillParameters,
    skills,
  };
}
