import { Thread } from '@/components/assistant-ui/thread';
import type { Unstable_SlashCommand } from '@assistant-ui/react';
import type { SkillParameter } from '../../../shared/types';

export interface PendingParameterSkill {
  skillId: string;
  skillName: string;
  parameters: SkillParameter[];
}

export interface PendingVariablePrompt {
  templateId: string;
  variables: string[];
}

interface AssistantThreadProps {
  commands?: Unstable_SlashCommand[];
  pendingParameterSkill?: PendingParameterSkill | null;
  pendingVariablePrompt?: PendingVariablePrompt | null;
  onApplySkillParameters?: (values: Record<string, string>) => void;
  onCancelSkillParameters?: () => void;
  onApplyVariableValues?: (values: Record<string, string>) => void;
  onCancelVariableFill?: () => void;
}

export function AssistantThread({
  commands,
  pendingParameterSkill,
  pendingVariablePrompt,
  onApplySkillParameters,
  onCancelSkillParameters,
  onApplyVariableValues,
  onCancelVariableFill,
}: AssistantThreadProps) {
  return (
    <Thread
      commands={commands}
      pendingParameterSkill={pendingParameterSkill}
      pendingVariablePrompt={pendingVariablePrompt}
      onApplySkillParameters={onApplySkillParameters}
      onCancelSkillParameters={onCancelSkillParameters}
      onApplyVariableValues={onApplyVariableValues}
      onCancelVariableFill={onCancelVariableFill}
    />
  );
}
