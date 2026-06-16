import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../../shared/types';
import { ToolEntry } from '../../tools/tool-types';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep',
    description: 'Search file contents under the workspace by regex. Returns matches as {path, line, content}.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        include: { type: 'string', description: 'Optional glob to restrict files (e.g. "*.ts"). Single * does not cross path segments.' },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive match (default false).' },
        max_results: { type: 'number', description: 'Max matches to return (default 100).' },
      },
      required: ['pattern'],
    },
  },
};

// Same semantics as globTool: * within segment, ** across segments.
function globToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
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
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      await walk(full, base, out);
    } else {
      out.push(path.relative(base, full));
    }
  }
}

export function createGrepTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params, ctx) => {
      const workspace = ctx?.workspace ?? process.cwd();
      const pattern: string = params.pattern;
      const includeGlob: string | undefined = params.include;
      const caseInsensitive = params.case_insensitive === true;
      const maxResults = typeof params.max_results === 'number' ? params.max_results : 100;

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
      } catch (e: any) {
        return JSON.stringify({ success: false, error: `Invalid regex: ${e.message}` });
      }

      const includeRe = includeGlob ? globToRegex(includeGlob) : null;
      const all: string[] = [];
      await walk(workspace, workspace, all);

      const matches: { path: string; line: number; content: string }[] = [];
      for (const rel of all) {
        if (includeRe && !includeRe.test(rel)) continue;
        const full = path.resolve(workspace, rel);
        let content: string;
        try {
          content = await fs.readFile(full, 'utf-8');
        } catch {
          continue; // skip unreadable / binary
        }
        if (content.includes('\0')) continue; // skip binary files
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({ path: full, line: i + 1, content: lines[i] });
            if (matches.length >= maxResults) {
              return JSON.stringify({ success: true, matches, truncated: true });
            }
          }
        }
      }
      return JSON.stringify({ success: true, matches });
    },
  };
}
