import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if they do not exist. Supports appending to existing files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
        append: {
          type: 'boolean',
          description: 'Whether to append to the file instead of overwriting (default: false)',
        },
      },
      required: ['path', 'content'],
    },
  },
};

export function createWriteFileTool(): ToolEntry {
  return {
    definition: DEFINITION,
    requiresApproval: true,
    handler: async (params: Record<string, any>, ctx?) => {
      try {
        const resolvedPath = path.resolve((ctx?.workspace ?? process.cwd()), params.path);
        const content = params.content;
        const append = params.append === true;

        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });

        if (append) {
          await fs.appendFile(resolvedPath, content, 'utf-8');
        } else {
          await fs.writeFile(resolvedPath, content, 'utf-8');
        }

        const stat = await fs.stat(resolvedPath);

        return JSON.stringify({
          path: resolvedPath,
          size: stat.size,
          appended: append,
          success: true,
        });
      } catch (error: any) {
        Logger.error('write_file tool error:', error);
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
