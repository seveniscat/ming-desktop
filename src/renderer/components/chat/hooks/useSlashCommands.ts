import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Unstable_SlashCommand } from '@assistant-ui/react';
import type { PromptTemplate } from '../../../../shared/types';
import type { SkillParameter } from '../../../../shared/types';

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

export interface PendingVariablePrompt {
  content: string;
  variables: string[];
}

export interface PendingParameterSkill {
  skillId: string;
  skillName: string;
  parameters: SkillParameter[];
  autoMessage?: string;
}

interface SlashCommandContext {
  onActivateSkill: (skillId: string, autoMessage?: string) => void;
  onPendingVariablePrompt: (prompt: PendingVariablePrompt | null) => void;
  onPendingParameterSkill: (skill: PendingParameterSkill | null) => void;
}

export function useSlashCommands(
  promptTemplates: PromptTemplate[],
  ctx: SlashCommandContext,
) {
  const [skills, setSkills] = useState<any[]>([]);
  const [pendingParameterSkill, setPendingParameterSkill] = useState<PendingParameterSkill | null>(null);
  const [pendingVariablePrompt, setPendingVariablePrompt] = useState<PendingVariablePrompt | null>(null);

  useEffect(() => {
    window.electronAPI.skills.list().then((list: any[]) => {
      setSkills(list.filter((s: any) => s.enabled));
    }).catch(() => {});
  }, []);

  const commands = useMemo<Unstable_SlashCommand[]>(() => {
    const skillCommands: Unstable_SlashCommand[] = skills.map((skill) => ({
      id: `skill-${skill.id}`,
      label: skill.name,
      description: skill.description || '',
      icon: 'Wrench',
      execute: () => {
        if (skill.parameters?.length > 0) {
          const pending: PendingParameterSkill = {
            skillId: skill.id,
            skillName: skill.name,
            parameters: skill.parameters,
            autoMessage: skill.autoMessage,
          };
          setPendingParameterSkill(pending);
          ctx.onPendingParameterSkill(pending);
        } else {
          ctx.onActivateSkill(skill.id, skill.autoMessage);
        }
      },
    }));

    const promptCommands: Unstable_SlashCommand[] = promptTemplates
      .filter((p) => p.enabled)
      .map((prompt) => ({
        id: `prompt-${prompt.id}`,
        label: prompt.name,
        description: prompt.description,
        icon: 'FileText',
        execute: () => {
          const vars = extractVariables(prompt.content);
          if (vars.length > 0) {
            const pending: PendingVariablePrompt = { content: prompt.content, variables: vars };
            setPendingVariablePrompt(pending);
            ctx.onPendingVariablePrompt(pending);
          } else {
            // For prompts without variables, we need to inject into composer.
            // This is handled by returning a special marker that the composer can detect.
            // For now, we just activate as a skill-like injection.
            ctx.onActivateSkill(`__prompt__${prompt.id}`, prompt.content);
          }
        },
      }));

    return [...skillCommands, ...promptCommands];
  }, [skills, promptTemplates, ctx]);

  const applyVariableValues = useCallback((values: Record<string, string>) => {
    if (!pendingVariablePrompt) return;
    let rendered = pendingVariablePrompt.content;
    for (const [key, value] of Object.entries(values)) {
      rendered = rendered.split(`{${key}}`).join(value);
    }
    // Inject rendered prompt text as a skill-like message
    ctx.onActivateSkill('__prompt__variable', rendered);
    setPendingVariablePrompt(null);
    ctx.onPendingVariablePrompt(null);
  }, [pendingVariablePrompt, ctx]);

  const cancelVariableFill = useCallback(() => {
    setPendingVariablePrompt(null);
    ctx.onPendingVariablePrompt(null);
  }, [ctx]);

  const applySkillParameters = useCallback((values: Record<string, string>) => {
    if (!pendingParameterSkill) return;
    let message = pendingParameterSkill.autoMessage || '';
    for (const [key, value] of Object.entries(values)) {
      message = message.split(`{${key}}`).join(value);
    }
    ctx.onActivateSkill(pendingParameterSkill.skillId, message || undefined);
    setPendingParameterSkill(null);
    ctx.onPendingParameterSkill(null);
  }, [pendingParameterSkill, ctx]);

  const cancelSkillParameters = useCallback(() => {
    setPendingParameterSkill(null);
    ctx.onPendingParameterSkill(null);
  }, [ctx]);

  return {
    commands,
    pendingVariablePrompt,
    pendingParameterSkill,
    applyVariableValues,
    cancelVariableFill,
    applySkillParameters,
    cancelSkillParameters,
    skills,
  };
}
