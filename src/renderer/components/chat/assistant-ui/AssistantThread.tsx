import { Thread } from '@/components/assistant-ui/thread';
import type { Unstable_SlashCommand } from '@assistant-ui/react';
import type { SkillParameter } from '../../../shared/types';
import type { QuickAction } from '@/components/assistant-ui/thread';

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
  quickActions?: QuickAction[];
  onApplySkillParameters?: (values: Record<string, string>) => void;
  onCancelSkillParameters?: () => void;
  onApplyVariableValues?: (values: Record<string, string>) => void;
  onCancelVariableFill?: () => void;
}

export function AssistantThread({
  commands,
  pendingParameterSkill,
  pendingVariablePrompt,
  quickActions,
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
      quickActions={quickActions}
      onApplySkillParameters={onApplySkillParameters}
      onCancelSkillParameters={onCancelSkillParameters}
      onApplyVariableValues={onApplyVariableValues}
      onCancelVariableFill={onCancelVariableFill}
    />
  );
}
