import type { PromptTemplate } from '../../../shared/types';

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
}

export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  type: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
}

export interface PromptSuggestion {
  id: string;
  name: string;
  trigger: string;
  description: string;
  content: string;
  type: 'builtin' | 'prompt' | 'tool' | 'skill';
}

export interface ExecutionStep {
  id: string;
  type: 'request' | 'response' | 'chunk' | 'tool' | 'error';
  timestamp: number;
  title: string;
  detail?: string;
  status: 'active' | 'done' | 'error';
}

export interface ExecutionState {
  steps: ExecutionStep[];
  collapsed: boolean;
  finished: boolean;
}

export interface ChatLaunchRequest {
  agentName: string;
  message: string;
  model?: string;
  newConversation?: boolean;
  reuseAgentConversation?: boolean;
  autoSend?: boolean;
}

export type { PromptTemplate };
