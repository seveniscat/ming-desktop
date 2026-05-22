import { Thread } from '@/components/assistant-ui/thread';
import type { Unstable_SlashCommand } from '@assistant-ui/react';

interface AssistantThreadProps {
  commands?: Unstable_SlashCommand[];
}

export function AssistantThread({ commands }: AssistantThreadProps) {
  return <Thread commands={commands} />;
}
