import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../../shared/types';
import { ToolEntry } from '../../tools/tool-types';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob',
    description: 'Find files under the workspace by glob pattern (supports *, **, ?). Returns matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts" or "src/*.json".' },
      },
      required: ['pattern'],
    },
  },
};

function globToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++; // consume '**/'
      } else {
        re += '.*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$(){}|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

async function walk(root: string, base: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) {
      await walk(full, base, out);
    } else {
      out.push(rel);
    }
  }
}

export function createGlobTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params, ctx) => {
      const workspace = ctx?.workspace ?? process.cwd();
      const pattern: string = params.pattern;
      const regex = globToRegex(pattern);
      const all: string[] = [];
      await walk(workspace, workspace, all);
      const matches = all
        .filter((rel) => regex.test(rel))
        .map((rel) => path.resolve(workspace, rel))
        .sort();
      return JSON.stringify({ success: true, matches });
    },
  };
}
