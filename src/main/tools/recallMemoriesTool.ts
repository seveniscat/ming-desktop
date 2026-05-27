import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_memories',
    description: 'Recall stored memories about the user. Returns relevant facts and preferences to personalize responses. Use this when you need context about the user.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look up about the user (for future semantic search, currently returns all)',
        },
        limit: {
          type: 'number',
          description: 'Max memories to return (default: 10)',
        },
      },
    },
  },
};

export function createRecallMemoriesTool(
  getMemoryManager: () => import('../services/MemoryManager').MemoryManager,
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      try {
        const mm = getMemoryManager();
        const limit = params.limit || 10;
        const query = params.query?.trim();
        const memories = query
          ? mm.search(query, limit)
          : mm.getActiveMemories().slice(0, limit);
        return JSON.stringify({
          count: memories.length,
          query: query || null,
          memories: memories.map(m => ({ content: m.content, category: m.category })),
        });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
