import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'suggest_memory',
    description: 'Suggest a memory to save about the user. Use this when the user shares personal information, preferences, work habits, or other facts worth remembering for future conversations. The suggestion will be shown to the user for confirmation before saving.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory content as a short factual statement, e.g. "用户是前端工程师，精通 React"',
        },
        category: {
          type: 'string',
          enum: ['profile', 'preference', 'context', 'custom'],
          description: 'Category: profile (identity/role), preference (style/habits), context (project/work info), custom (other)',
        },
        reason: {
          type: 'string',
          description: 'Why this is worth remembering (shown to user for context)',
        },
      },
      required: ['content', 'category'],
    },
  },
};

export function createSuggestMemoryTool(
  getMemoryManager: () => import('../services/MemoryManager').MemoryManager,
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      try {
        const mm = getMemoryManager();
        const memory = mm.create({
          content: params.content,
          category: params.category,
          source: 'agent_suggested',
        });
        return JSON.stringify({
          success: true,
          message: `Memory suggestion saved: "${memory.content}" (${memory.category})`,
          memory: { id: memory.id, content: memory.content, category: memory.category },
        });
      } catch (error: any) {
        return JSON.stringify({ success: false, error: error.message || String(error) });
      }
    },
  };
}
