# Builtin Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 builtin tools (read_file, list_directory, write_file, execute_command, search_files) that the Agent can call during chat and users can test from the Tools page.

**Architecture:** Each tool is a factory function returning `ToolEntry` (definition + handler), registered in `main.ts` at startup. Destructive tools (write_file, execute_command) require user approval via IPC dialog.

**Tech Stack:** Node.js fs module, ExecutorService (existing), IPC channels (existing pattern), vitest for tests.

---

### Task 1: read_file tool

**Files:**
- Create: `src/main/tools/readFileTool.ts`

**Step 1: Create the tool file**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition } from '../../shared/types';
import type { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. Returns file content as a string, with optional line-based offset and limit for reading portions of large files.',
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
          default: 'utf-8',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (0-based). Useful for large files.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read.',
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
      const filePath = path.resolve(params.path);
      const encoding = params.encoding || 'utf-8';

      try {
        let content = await fs.readFile(filePath, encoding as BufferEncoding);

        if (params.offset !== undefined || params.limit !== undefined) {
          const lines = content.split('\n');
          const start = params.offset || 0;
          const end = params.limit !== undefined ? start + params.limit : lines.length;
          content = lines.slice(start, end).join('\n');
        }

        return JSON.stringify({
          path: filePath,
          content,
          size: content.length,
        });
      } catch (error: any) {
        Logger.error('read_file failed:', error);
        return JSON.stringify({ error: error.message, path: filePath });
      }
    },
  };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/main/tools/readFileTool.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/tools/readFileTool.ts
git commit -m "feat(tools): add read_file builtin tool"
```

---

### Task 2: list_directory tool

**Files:**
- Create: `src/main/tools/listDirectoryTool.ts`

**Step 1: Create the tool file**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition } from '../../shared/types';
import type { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_directory',
    description: 'List files and directories at the given path. Returns an array of entries with name, type (file/directory), and size. Supports recursive listing and glob pattern filtering.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory to list',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively (default: false)',
          default: false,
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter entries (e.g. "*.ts", "**/*.json")',
        },
      },
      required: ['path'],
    },
  },
};

function matchGlob(name: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(name);
}

async function listDir(
  dirPath: string,
  recursive: boolean,
  pattern?: string,
  prefix: string = '',
): Promise<Array<{ name: string; type: string; size: number; path: string }>> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: Array<{ name: string; type: string; size: number; path: string }> = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const displayName = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (!pattern || matchGlob(entry.name, pattern) || recursive) {
        results.push({ name: displayName, type: 'directory', size: 0, path: fullPath });
      }
      if (recursive) {
        try {
          const sub = await listDir(fullPath, true, pattern, displayName);
          results.push(...sub);
        } catch {
          // skip inaccessible dirs
        }
      }
    } else if (entry.isFile()) {
      if (!pattern || matchGlob(entry.name, pattern)) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({ name: displayName, type: 'file', size: stat.size, path: fullPath });
        } catch {
          results.push({ name: displayName, type: 'file', size: 0, path: fullPath });
        }
      }
    }
  }

  return results;
}

export function createListDirectoryTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      const dirPath = path.resolve(params.path);
      const recursive = params.recursive || false;
      const pattern = params.pattern;

      try {
        const entries = await listDir(dirPath, recursive, pattern);
        return JSON.stringify({
          path: dirPath,
          entries,
          total: entries.length,
        });
      } catch (error: any) {
        Logger.error('list_directory failed:', error);
        return JSON.stringify({ error: error.message, path: dirPath });
      }
    },
  };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/main/tools/listDirectoryTool.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/tools/listDirectoryTool.ts
git commit -m "feat(tools): add list_directory builtin tool"
```

---

### Task 3: write_file tool

**Files:**
- Create: `src/main/tools/writeFileTool.ts`

**Step 1: Create the tool file**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition } from '../../shared/types';
import type { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Write content to a file. Creates the file (and parent directories) if it does not exist. Can optionally append instead of overwrite. THIS IS A DESTRUCTIVE OPERATION — requires user approval.',
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
          description: 'If true, append to the file instead of overwriting (default: false)',
          default: false,
        },
      },
      required: ['path', 'content'],
    },
  },
};

export function createWriteFileTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      const filePath = path.resolve(params.path);
      const content = params.content;
      const append = params.append || false;

      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        if (append) {
          await fs.appendFile(filePath, content, 'utf-8');
        } else {
          await fs.writeFile(filePath, content, 'utf-8');
        }

        const stat = await fs.stat(filePath);
        return JSON.stringify({
          path: filePath,
          size: stat.size,
          appended: append,
          success: true,
        });
      } catch (error: any) {
        Logger.error('write_file failed:', error);
        return JSON.stringify({ error: error.message, path: filePath, success: false });
      }
    },
  };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/main/tools/writeFileTool.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/tools/writeFileTool.ts
git commit -m "feat(tools): add write_file builtin tool"
```

---

### Task 4: execute_command tool

**Files:**
- Create: `src/main/tools/executeCommandTool.ts`
- Reference: `src/main/services/ExecutorService.ts` (reuse `executeCommand`)

**Step 1: Create the tool file**

```typescript
import type { ToolDefinition } from '../../shared/types';
import type { ToolEntry } from './ToolExecutor';
import { ExecutorService } from '../services/ExecutorService';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'execute_command',
    description: 'Execute a shell command and return its stdout, stderr, and exit code. THIS IS A DESTRUCTIVE OPERATION — requires user approval.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (default: user home)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
          default: 30000,
        },
      },
      required: ['command'],
    },
  },
};

export function createExecuteCommandTool(
  executorService: ExecutorService,
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      const command = params.command;
      const cwd = params.cwd || process.env.HOME;
      const timeout = params.timeout || 30000;

      try {
        const result = await executorService.executeCommand(command, {
          cwd,
          timeout,
        });

        return JSON.stringify({
          command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
          success: result.success,
        });
      } catch (error: any) {
        Logger.error('execute_command failed:', error);
        return JSON.stringify({
          command,
          error: error.message,
          success: false,
        });
      }
    },
  };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/main/tools/executeCommandTool.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/tools/executeCommandTool.ts
git commit -m "feat(tools): add execute_command builtin tool"
```

---

### Task 5: search_files tool

**Files:**
- Create: `src/main/tools/searchFilesTool.ts`

**Step 1: Create the tool file**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition } from '../../shared/types';
import type { ToolEntry } from './ToolExecutor';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_files',
    description: 'Search file contents by regex pattern. Returns matching lines with file path, line number, and matched text. Searches the given directory recursively.',
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
          description: 'File glob pattern to filter files (e.g. "*.ts", "*.json")',
        },
        ignoreCase: {
          type: 'boolean',
          description: 'Case-insensitive search (default: false)',
          default: false,
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
          default: 100,
        },
      },
      required: ['pattern'],
    },
  },
};

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage',
]);

function matchGlob(fileName: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]*')
    .replace(/\?/g, '[^.]');
  return new RegExp(`^${regexStr}$`).test(fileName);
}

async function searchDir(
  dirPath: string,
  regex: RegExp,
  globPattern: string | undefined,
  maxResults: number,
  results: Array<{ file: string; line: number; text: string }>,
): Promise<void> {
  if (results.length >= maxResults) return;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) return;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      await searchDir(fullPath, regex, globPattern, maxResults, results);
    } else if (entry.isFile()) {
      if (globPattern && !matchGlob(entry.name, globPattern)) continue;
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: fullPath,
              line: i + 1,
              text: lines[i].trim(),
            });
          }
        }
      } catch {
        // skip unreadable/binary files
      }
    }
  }
}

export function createSearchFilesTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      const pattern = params.pattern;
      const searchPath = path.resolve(params.path || process.cwd());
      const globPattern = params.glob;
      const ignoreCase = params.ignoreCase || false;
      const maxResults = params.maxResults || 100;

      try {
        const regex = new RegExp(pattern, ignoreCase ? 'i' : '');
        const results: Array<{ file: string; line: number; text: string }> = [];

        await searchDir(searchPath, regex, globPattern, maxResults, results);

        return JSON.stringify({
          pattern,
          path: searchPath,
          matches: results.length,
          results,
        });
      } catch (error: any) {
        if (error instanceof SyntaxError) {
          return JSON.stringify({ error: `Invalid regex pattern: ${error.message}`, pattern });
        }
        Logger.error('search_files failed:', error);
        return JSON.stringify({ error: error.message, path: searchPath });
      }
    },
  };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/main/tools/searchFilesTool.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/tools/searchFilesTool.ts
git commit -m "feat(tools): add search_files builtin tool"
```

---

### Task 6: Tool approval system

**Files:**
- Modify: `src/shared/ipc-channels.ts` — add approval IPC channels
- Create: `src/main/tools/toolApproval.ts` — approval manager
- Modify: `src/main/main.ts` — register approval IPC handlers
- Modify: `src/main/preload.ts` — expose approval API to renderer
- Create: `src/renderer/components/tools/ToolApprovalDialog.tsx` — approval UI dialog

**Step 1: Add IPC channels**

In `src/shared/ipc-channels.ts`, add to the `IPCChannels` enum:

```typescript
  // Tool approval
  TOOL_APPROVAL_REQUEST = 'tool:approval-request',
  TOOL_APPROVAL_RESPONSE = 'tool:approval-response',
```

**Step 2: Create ToolApprovalManager**

Create `src/main/tools/toolApproval.ts`:

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import { IPCChannels } from '../../shared/ipc-channels';
import { Logger } from '../utils/Logger';

interface PendingApproval {
  resolve: (approved: boolean) => void;
  toolName: string;
  params: Record<string, any>;
}

export class ToolApprovalManager {
  private pending: Map<string, PendingApproval> = new Map();

  constructor() {
    ipcMain.on(IPCChannels.TOOL_APPROVAL_RESPONSE, (_event, requestId: string, approved: boolean) => {
      const pending = this.pending.get(requestId);
      if (pending) {
        pending.resolve(approved);
        this.pending.delete(requestId);
      }
    });
  }

  async requestApproval(
    mainWindow: BrowserWindow,
    toolName: string,
    params: Record<string, any>,
  ): Promise<boolean> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    return new Promise((resolve) => {
      this.pending.set(requestId, { resolve, toolName, params });

      mainWindow.webContents.send(IPCChannels.TOOL_APPROVAL_REQUEST, {
        requestId,
        toolName,
        params,
      });

      // Auto-deny after 60s
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          resolve(false);
        }
      }, 60000);
    });
  }
}
```

**Step 3: Expose approval API in preload**

In `src/main/preload.ts`, add to the `tools` section of both the implementation and the type definition:

In the `contextBridge.exposeInMainWorld` tools object, add:
```typescript
    onApprovalRequest: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPCChannels.TOOL_APPROVAL_REQUEST, listener);
      return () => ipcRenderer.removeListener(IPCChannels.TOOL_APPROVAL_REQUEST, listener);
    },
    respondApproval: (requestId: string, approved: boolean) => {
      ipcRenderer.send(IPCChannels.TOOL_APPROVAL_RESPONSE, requestId, approved);
    },
```

In the `ElectronAPI` type, add to the `tools` section:
```typescript
    onApprovalRequest: (callback: (data: any) => void) => () => void;
    respondApproval: (requestId: string, approved: boolean) => void;
```

**Step 4: Create the approval dialog component**

Create `src/renderer/components/tools/ToolApprovalDialog.tsx`:

A modal dialog that listens for approval requests, shows the tool name and params (JSON), and has Approve/Deny buttons. Uses the existing shadcn Dialog component.

**Step 5: Wire up in App.tsx or main layout**

Mount `ToolApprovalDialog` in the app root so it's always listening.

**Step 6: Integrate into ToolExecutor**

Modify `ToolExecutor` to accept an optional `ToolApprovalManager` and `BrowserWindow`. For destructive tools (`write_file`, `execute_command`), check if approval is needed before executing.

Add a `requiresApproval` flag to `ToolEntry`:

```typescript
export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  requiresApproval?: boolean;
}
```

**Step 7: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/tools/toolApproval.ts src/main/main.ts src/main/preload.ts src/renderer/components/tools/ToolApprovalDialog.tsx
git commit -m "feat(tools): add user approval flow for destructive tools"
```

---

### Task 7: Register all tools in main.ts

**Files:**
- Modify: `src/main/main.ts` — import and register all 5 tools

**Step 1: Add imports and registrations**

In `src/main/main.ts`, add imports:

```typescript
import { createReadFileTool } from './tools/readFileTool';
import { createListDirectoryTool } from './tools/listDirectoryTool';
import { createWriteFileTool } from './tools/writeFileTool';
import { createExecuteCommandTool } from './tools/executeCommandTool';
import { createSearchFilesTool } from './tools/searchFilesTool';
import { ToolApprovalManager } from './tools/toolApproval';
```

After the existing `toolExecutor.register(createDailyReportTool(...))` line, add:

```typescript
  const toolApprovalManager = new ToolApprovalManager();

  toolExecutor.register(createReadFileTool());
  toolExecutor.register(createListDirectoryTool());
  toolExecutor.register(createWriteFileTool());
  toolExecutor.register(createExecuteCommandTool(executorService));
  toolExecutor.register(createSearchFilesTool());
```

**Step 2: Verify it builds**

Run: `npx electron-vite build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(tools): register 5 builtin tools in main process"
```

---

### Task 8: Manual integration test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify in Tools page**

1. Navigate to Tools page
2. Confirm 5 new tools appear in the list
3. Click each tool to view details
4. Use "Test" button (if ToolTester exists) on `read_file` with `{ "path": "/etc/hosts" }` — should return file contents
5. Test `list_directory` with `{ "path": "." }` — should return directory listing
6. Test `search_files` with `{ "pattern": "ToolExecutor", "path": "src/main/tools" }` — should return matches

**Step 3: Verify approval flow**

1. Test `write_file` — should trigger approval dialog
2. Test `execute_command` with `{ "command": "echo hello" }` — should trigger approval dialog
3. Deny one, approve the other — verify correct behavior

**Step 4: Verify Agent can call tools**

1. Create/test an Agent that has these tools enabled
2. Ask the Agent to read a file or list a directory
3. Confirm the Agent gets the tool result and responds correctly
