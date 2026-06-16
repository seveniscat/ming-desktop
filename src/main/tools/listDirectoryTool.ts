import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_directory',
    description: 'List files and directories at a given path. Supports recursive listing and glob pattern filtering.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory to list',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list entries recursively (default: false)',
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter entries (e.g. "*.ts", "**/*.json"). Uses * for any non-slash chars and ** for any path segment.',
        },
      },
      required: ['path'],
    },
  },
};

function globToRegex(pattern: string): RegExp {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${regexStr}$`);
}

interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  path: string;
}

async function listEntriesRecursive(
  dirPath: string,
  baseDir: string,
  globRegex: RegExp | null,
  entries: DirEntry[]
): Promise<void> {
  let items;
  try {
    items = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (item.isDirectory()) {
      if (!globRegex) {
        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        entries.push({
          name: item.name,
          type: 'directory',
          size: stat.size,
          path: fullPath,
        });
      }
      await listEntriesRecursive(fullPath, baseDir, globRegex, entries);
    } else if (item.isFile()) {
      if (globRegex && !globRegex.test(relativePath) && !globRegex.test(item.name)) {
        continue;
      }
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }
      entries.push({
        name: item.name,
        type: 'file',
        size: stat.size,
        path: fullPath,
      });
    }
  }
}

export function createListDirectoryTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>, ctx?) => {
      try {
        const resolvedPath = path.resolve((ctx?.workspace ?? process.cwd()), params.path);
        const recursive = params.recursive === true;
        const globRegex = params.pattern ? globToRegex(params.pattern) : null;

        const entries: DirEntry[] = [];

        if (recursive) {
          await listEntriesRecursive(resolvedPath, resolvedPath, globRegex, entries);
        } else {
          const items = await fs.readdir(resolvedPath, { withFileTypes: true });

          for (const item of items) {
            const fullPath = path.join(resolvedPath, item.name);
            if (globRegex && !globRegex.test(item.name)) {
              continue;
            }

            const stat = await fs.stat(fullPath);
            entries.push({
              name: item.name,
              type: item.isDirectory() ? 'directory' : 'file',
              size: stat.size,
              path: fullPath,
            });
          }
        }

        return JSON.stringify({
          path: resolvedPath,
          entries,
          total: entries.length,
        });
      } catch (error: any) {
        Logger.error('list_directory tool error:', error);
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
