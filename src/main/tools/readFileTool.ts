import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file. Supports reading specific line ranges via offset and limit parameters. Returns the file content along with metadata.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read',
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-based). If omitted, reads from the beginning.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read. If omitted, reads the entire file.',
        },
      },
      required: ['path'],
    },
  },
};

export function createReadFileTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      try {
        const resolvedPath = path.resolve(params.path);
        const encoding = params.encoding || 'utf-8';

        const content = await fs.readFile(resolvedPath, encoding as BufferEncoding);
        const stat = await fs.stat(resolvedPath);

        let resultContent = content;

        if (params.offset != null || params.limit != null) {
          const lines = content.split('\n');
          const offset = params.offset ? Math.max(0, params.offset - 1) : 0;
          const limit = params.limit ?? lines.length - offset;
          resultContent = lines.slice(offset, offset + limit).join('\n');
        }

        return JSON.stringify({
          path: resolvedPath,
          content: resultContent,
          size: stat.size,
        });
      } catch (error: any) {
        Logger.error('read_file tool error:', error);
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
