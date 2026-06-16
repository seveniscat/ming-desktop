import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../../shared/types';
import { ToolEntry } from '../../tools/tool-types';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit_file',
    description:
      'Perform a precise string replacement in a file. old_string must match exactly once in the file (provide enough surrounding context to be unique). If old_string is empty and the file does not exist, creates the file with new_string.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file (relative to workspace or absolute).' },
        old_string: { type: 'string', description: 'The exact text to replace. Empty to create a new file.' },
        new_string: { type: 'string', description: 'The replacement text.' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function createEditFileTool(): ToolEntry {
  return {
    definition: DEFINITION,
    requiresApproval: true,
    handler: async (params, ctx) => {
      const filePath = path.resolve(ctx?.workspace ?? process.cwd(), params.file_path);
      const oldString: string = params.old_string ?? '';
      const newString: string = params.new_string ?? '';

      // Create-new-file path
      if (oldString === '') {
        try {
          await fs.readFile(filePath);
          return JSON.stringify({ success: false, error: 'File already exists; provide a non-empty old_string to edit it.' });
        } catch {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, newString, 'utf-8');
          return JSON.stringify({ success: true, file_path: filePath, created: true });
        }
      }

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        return JSON.stringify({ success: false, error: `File not found: ${filePath}` });
      }

      const occurrences = countOccurrences(content, oldString);
      if (occurrences === 0) {
        const preview = content.slice(0, 300);
        return JSON.stringify({ success: false, error: `No match found for old_string. File starts with:\n${preview}` });
      }
      if (occurrences > 1) {
        return JSON.stringify({ success: false, error: `old_string matched ${occurrences} times; include more surrounding context so it is unique.` });
      }

      const updated = content.replace(oldString, newString);
      await fs.writeFile(filePath, updated, 'utf-8');
      return JSON.stringify({ success: true, file_path: filePath });
    },
  };
}
