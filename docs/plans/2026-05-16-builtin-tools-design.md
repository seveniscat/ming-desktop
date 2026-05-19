# Builtin Tools Design

5 builtin tools for Agent tool-calling and user manual execution.

## Tools

| Name | Category | Description |
|------|----------|-------------|
| `read_file` | file | Read file contents with optional offset/limit |
| `list_directory` | file | List directory entries, optional recursive and glob filter |
| `write_file` | file | Write or append content to a file |
| `execute_command` | system | Run a shell command, return stdout/stderr |
| `search_files` | code | Search file contents by regex pattern |

### Parameters

**read_file**: `path` (required), `encoding?`, `offset?`, `limit?`
**list_directory**: `path` (required), `recursive?`, `pattern?` (glob)
**write_file**: `path` (required), `content` (required), `append?` (default false)
**execute_command**: `command` (required), `cwd?`, `timeout?`
**search_files**: `pattern` (required), `path?`, `glob?`, `ignoreCase?`, `maxResults?`

## Security: User Approval

`write_file` and `execute_command` are destructive — require user approval.

**Flow:**
1. Agent sends tool call
2. Backend pauses, sends `TOOL_APPROVAL_REQUEST` IPC event to renderer
3. Renderer shows approval dialog (tool name + params)
4. User approves/denies via `TOOL_APPROVAL_RESPONSE` IPC
5. Backend executes or returns "user denied" error

Read-only tools (`read_file`, `list_directory`, `search_files`) execute immediately without approval.

## File Structure

```
src/main/tools/
  readFileTool.ts         (new)
  listDirectoryTool.ts    (new)
  writeFileTool.ts        (new)
  executeCommandTool.ts   (new)
  searchFilesTool.ts      (new)
  toolApproval.ts         (new — approval IPC flow)
```

## Implementation Notes

- `read_file` / `write_file` — use `fs` module directly
- `list_directory` — use `fs.readdir` + `fs.stat`, glob filtering with `minimatch`
- `execute_command` — reuse `ExecutorService.executeCommand()`
- `search_files` — line-by-line regex search with `fs` (no ripgrep dependency)
- All tools return JSON string results (consistent with existing pattern)
- Each tool: `createXxxTool()` factory returning `ToolEntry`, registered in `main.ts`
