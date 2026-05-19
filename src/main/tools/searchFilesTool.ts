import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_files',
    description: 'Search for a regex pattern in files within a directory. Skips common directories like node_modules, .git, dist, and build. Returns matching lines with file path and line number.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: current working directory)',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g. "*.ts", "*.json")',
        },
        ignoreCase: {
          type: 'boolean',
          description: 'Whether to perform a case-insensitive search (default: false)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
        },
      },
      required: ['pattern'],
    },
  },
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

function matchesGlob(fileName: string, glob: string): boolean {
  const regexStr = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${regexStr}$`).test(fileName);
}

async function searchInDirectory(
  dirPath: string,
  regex: RegExp,
  globFilter: string | null,
  maxResults: number,
  results: SearchResult[]
): Promise<void> {
  if (results.length >= maxResults) return;

  let items;
  try {
    items = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    if (results.length >= maxResults) return;

    const fullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      await searchInDirectory(fullPath, regex, globFilter, maxResults, results);
    } else if (item.isFile()) {
      if (globFilter && !matchesGlob(item.name, globFilter)) continue;

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) return;
          if (regex.test(lines[i])) {
            results.push({
              file: fullPath,
              line: i + 1,
              text: lines[i],
            });
          }
        }
      } catch {
        // Skip files that cannot be read (binary, permission, etc.)
      }
    }
  }
}

export function createSearchFilesTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      try {
        const searchPath = path.resolve(params.path || process.cwd());
        const maxResults = params.maxResults ?? 100;
        const globFilter = params.glob || null;

        const flags = params.ignoreCase ? 'i' : '';
        const regex = new RegExp(params.pattern, flags);

        const results: SearchResult[] = [];
        await searchInDirectory(searchPath, regex, globFilter, maxResults, results);

        return JSON.stringify({
          pattern: params.pattern,
          path: searchPath,
          matches: results.length,
          results,
        });
      } catch (error: any) {
        Logger.error('search_files tool error:', error);
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
