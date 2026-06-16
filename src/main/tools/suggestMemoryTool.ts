import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'suggest_memory',
    description: `Suggest a memory to save about the user. Use this when the user shares personal information, preferences, work habits, or other facts worth remembering for future conversations.

When to use:
- User mentions their role, skills, or tech stack (→ category: profile)
- User states a preference for response style, language, or format (→ category: preference)
- User describes their current project, team, or work context (→ category: context)
- User shares any other fact worth remembering (→ category: custom)

Do NOT use for:
- Temporary or one-time information
- Information already stored in existing memories
- Guesses or assumptions about the user`,
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
      required: ['content', 'category', 'reason'],
    },
  },
};

export function createSuggestMemoryTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>, _ctx?) => {
      try {
        return JSON.stringify({
          suggested: true,
          memory: {
            content: params.content,
            category: params.category,
            reason: params.reason || '',
          },
          message: `Memory suggested: "${params.content}" (${params.category}). Waiting for user confirmation.`,
        });
      } catch (error: any) {
        return JSON.stringify({ suggested: false, error: error.message || String(error) });
      }
    },
  };
}
