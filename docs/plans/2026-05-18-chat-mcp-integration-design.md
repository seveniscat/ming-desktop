# Chat → MCP Integration Design

## Overview

Bridge MCP tools into the existing ToolExecutor so all connected MCP tools are automatically available in every chat session.

## Architecture

- MCP tools register in ToolExecutor with `mcp__{serverName}__{toolName}` naming convention
- MCPManager emits `server-tools` events when tools change → ToolExecutor re-registers
- ToolExecutor.execute() routes `mcp__`-prefixed tools to MCPManager
- No changes to ChatEngine, LLM provider, agent config, or UI

## Flow

1. MCP server connects → MCPManager.refreshTools() → emits `server-tools`
2. Main.ts listener calls `syncMcpToolsToExecutor()` which registers all MCP tools as dynamic tools
3. ChatEngine.buildContext() calls `toolExecutor.getDefinitions()` — MCP tools included automatically
4. LLM returns tool_call for `mcp__server__tool` → ToolExecutor.execute() routes to MCPManager
5. MCPManager.callTool() → result flows back to chat

## Naming Convention

`mcp__{serverName}__{toolName}` — e.g. `mcp__filesystem__read_file`

Server name is sanitized (lowercase, hyphens replace spaces/special chars).

## No Approval Flow

MCP tools skip the tool approval dialog, same as built-in tools like read_file.
