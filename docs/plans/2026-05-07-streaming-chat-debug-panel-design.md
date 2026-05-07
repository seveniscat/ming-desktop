# Streaming Chat + Debug Panel Design

## Overview

将现有的同步请求-响应聊天改为流式输出，同时增加 UI 调试面板用于排查模型 API 调用问题。

## Architecture

```
Renderer                          Main Process
  │                                    │
  ├─ ipcRenderer.send(chat) ─────────►├─ ipcMain.on(chat)
  │                                    ├─ LLMProvider.chatStream()
  │  ◄── webContents.send(chunk) ─────┤   ├─ chunk 1
  │  ◄── webContents.send(chunk) ─────┤   ├─ chunk 2
  │  ◄── webContents.send(chunk) ─────┤   └─ chunk N
  │  ◄── webContents.send(stream-end)─┤
```

## 1. IPC Layer

### New Channels

| Channel | Direction | Payload |
|---------|-----------|---------|
| `conversation:stream-chunk` | main → renderer | `{ conversationId, content }` |
| `conversation:stream-end` | main → renderer | `{ conversationId, fullContent, usage? }` |
| `conversation:stream-error` | main → renderer | `{ conversationId, error }` |
| `debug:model-call` | main → renderer | `{ type: 'request'\|'response'\|'chunk'\|'error', data }` |

### Changes

- `conversation:chat` changes from `ipcMain.handle` → `ipcMain.on` (fire-and-forget, no return value)
- Renderer uses `ipcRenderer.send` instead of `ipcRenderer.invoke`

## 2. LLMProviderManager

### New Method: `chatStream()`

Routes to provider-specific streaming implementations:

- **OpenAI compatible** (openai, qwen, deepseek, custom): `client.chat.completions.create({ stream: true })`, iterate async generator
- **Anthropic**: `client.messages.create({ stream: true })`, iterate stream events

Both accept callbacks:
- `onChunk(text: string)` — each text fragment
- `onDebug(event)` — debug events (request, chunk, error, response)
- Returns `Promise<{ fullContent: string, usage?: object }>`

## 3. AgentManager

### New Method: `chatInConversationStream()`

- Receives `webContents` reference for IPC push
- Save user message → load history → call `llmManager.chatStream()`
- On each chunk: `webContents.send('conversation:stream-chunk', ...)`
- On stream end: save full response to DB → `webContents.send('conversation:stream-end', ...)`
- On error: `webContents.send('conversation:stream-error', ...)`

## 4. Renderer (AgentChat.tsx)

- Send message via `ipcRenderer.send` instead of `await ipcRenderer.invoke`
- Register listeners: `conversation:stream-chunk`, `conversation:stream-end`, `conversation:stream-error`
- Incrementally append chunks to assistant message content
- Clean up listeners on unmount

## 5. Debug Panel

- Collapsible panel at top of chat area
- Listens to `ipcRenderer.on('debug:model-call')`
- Each API call shows: provider, model, request messages (API key masked), response chunks, elapsed time, token usage
- Expand/collapse details per call
- Clear button to reset log
