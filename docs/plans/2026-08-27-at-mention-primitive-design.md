# @ 原语（@ 引用）设计

> 日期：2026-08-27
> 状态：设计完成，待实施
> 优先级：P1 主线第一项

## 1. 背景与目标

Ming 的能力分散在多个子系统（Skills / Memories / Prompts / MCP / Git 工作数据），目前只有 slash 命令触达了技能和模板，其余能力没有统一入口。借鉴 Alma 的核心交互：**@ 是把所有能力收进一个入口的原语**。

目标：在 Chat 输入框输入 `@` 即可引用：

- `@记忆` —— 指定某条长期记忆进入本次对话上下文
- `@技能` —— 激活某个技能（复用现有 injectedSkills 通道）
- `@文件` —— 引用本地文件内容作为上下文
- `@Git` —— 引用某个时间范围的本地提交记录（"我这周干了什么"）

一句话验证场景：`帮我写周报 @Git[本周] @记忆[编码风格]` → 一次发送，两个上下文源就位。

## 2. 范围

**MVP（本 spec）**：Chat 页 composer 的 @ 引用，四类来源（记忆/技能/文件/Git），引用内容注入 system prompt 上下文块，引用关系随消息持久化并在气泡中展示来源标签。

**不做（后续 spec）**：

- @MCP 工具、@会话、@提示词模板（模板已有 slash + 变量填充，收益低）
- 行内 chip 富文本编辑（MVP 用"输入框上方引用条"，见 §4）
- Workspace 之外的全文检索（@文件 MVP 仅支持手动选路径）
- 记忆对象化（pinning / budget，路线图 P2）

## 3. 数据模型

### 3.1 MentionReference（shared/types.ts）

```ts
export type MentionKind = 'memory' | 'skill' | 'file' | 'git';

export interface MentionReference {
  kind: MentionKind;
  /** memory/skill 的记录 id；file 为绝对路径；git 为 'commits' */
  id: string;
  /** 展示名：记忆标题 / 技能名 / 文件名 / "本周提交" */
  label: string;
  /** kind 特有参数：git 的 timeRange（today/yesterday/week/custom + since/until）；file 无 */
  params?: Record<string, string>;
}
```

### 3.2 传递与持久化

- IPC：`conversation:chat` 增加尾参 `references?: MentionReference[]`（`preload.ts` 的 `conversations.chat` 签名同步，注意更新文件底部 `ElectronAPI` 接口——这是 renderer 类型的唯一来源）。
- 持久化：迁移 25 为 `chat_messages` 增加 `mention_references TEXT DEFAULT NULL` 列（JSON 数组；列名避开 SQLite 关键字 REFERENCES），与现有 `tool_calls` 列的处理方式一致（`database/schema.ts` 末尾追加，防重入）。
- 消息文本本体保持用户可读的 `@label` 字样，结构化引用走 `references` 列；历史渲染优先用结构化数据画来源标签。

## 4. 交互设计

### 4.1 触发与选择

1. composer 输入 `@`（前缀或空格后）时弹出引用选择器（Popover，锚定输入框左下）。
2. 选择器分组列出：记忆（FTS 搜索框置顶）、技能（enabled）、文件（路径输入 + 最近引用）、Git（预设：今天/昨天/本周/自定义日期段）。
3. 键入关键词即过滤；↑↓ 选择，Enter/点击确认，Esc 关闭。
4. 确认后：**输入框上方出现引用条（chips bar）**——类似邮件附件：`[📇 周报偏好 ×] [🌲 本周提交 ×]`，可逐个移除；同时在输入光标处插入纯文本 `@label ` 保持行文连贯。MVP 不做行内富文本 chip。

### 4.2 发送与展示

- 发送时：`conversation:chat(conversationId, agentId, text, model, injectedSkills, references)`。
- 用户气泡底部渲染来源标签行（小号徽章，按 kind 着色）；助手回复无需感知。
- 技能类引用同时映射进 `injectedSkills`（与 slash 激活共用一条已验证通道），不重复注入。

## 5. 主进程注入设计

### 5.1 MentionResolver（新文件 src/main/chat/MentionResolver.ts）

纯依赖注入、可单测：

```ts
class MentionResolver {
  constructor(
    private getMemory: (id: string) => Memory | undefined,
    private getSkillPrompt: (skillId: string) => string | undefined,
    private getGitCommits: (params: GitRefParams) => Promise<{ commits: CommitSummary[]; repos: string[] }>,
  ) {}

  async resolve(refs: MentionReference[]): Promise<ResolvedContext[]>;  // 并行、单源失败不阻塞
}
interface ResolvedContext { ref: MentionReference; text: string; truncated?: boolean }
```

- **memory**：`MemoryManager.get(id)` → `content`。
- **skill**：`SkillManager` 的 prompt（SKILL.md 正文）；同时进 injectedSkills，resolve 结果仅作回显不二次注入。
- **file**：`fs.readFile`，UTF-8，**上限 16KB**，超限截断并标注 `truncated`；路径必须存在，二进制嗅探（含 \0）则拒绝。
- **git**：复用 dailyReportTool 的采集管线（`GitCacheManager` + 身份过滤），按 `params.timeRange` 聚合提交列表（hash/时间/repo/subject），**上限 200 条**。

### 5.2 ChatEngine.buildContext 注入

在现有 memoryPrompt 之后追加：

```
<referenced-context>
### @记忆：周报偏好
（记忆内容）
### @Git：本周提交
repo-a (12 commits) ...
- abc1234 feat: ...
</referenced-context>
```

- 总预算：所有引用块合计 **≤ 24k 字符**，超预算从后往前截断并保留 `truncated` 标记。
- 引用块注入 system prompt（不进 user 消息），保证多轮对话中持续在场；这与 skills/memory 的现有注入位置一致。

## 6. 涉及文件

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | `MentionReference` / `MentionKind` / `GitRefParams` |
| `src/shared/ipc-channels.ts` | 无新通道（复用 `conversation:chat`） |
| `src/main/database/schema.ts` | 迁移 25：`chat_messages.mention_references` 列 |
| `src/main/chat/MentionResolver.ts` | 新建（含单测） |
| `src/main/chat/ChatEngine.ts` | `ChatRequest` 加 `references`；`buildContext` 追加引用块 |
| `src/main/chat/ChatService.ts` | 透传 references 并持久化到消息 |
| `src/main/main.ts` | `conversation:chat` handler 增参 |
| `src/main/preload.ts` | chat 签名 + `ElectronAPI` 接口同步 |
| `src/renderer/components/chat/hooks/useMentions.ts` | 新建：触发检测、数据源加载、chips 状态 |
| `src/renderer/components/chat/MentionPicker.tsx` | 新建：分组选择器 Popover |
| `src/renderer/components/chat/MentionChipsBar.tsx` | 新建：引用条 + 移除 |
| `src/renderer/components/chat/ChatLayout.tsx` | 接线：composer onChange 检测、发送时携带、气泡来源标签 |
| `src/renderer/components/chat/assistant-ui/messageAdapter.ts` | 用户消息 parts 追加来源徽章 part |

## 7. 任务分解（建议 TDD，每任务可独立合入）

1. **类型与迁移**（已完成，commit 待补）：`MentionReference` 类型 + 迁移 25 + `ChatRequest.references`
2. **MentionResolver**（已完成）：14 个单测覆盖四类来源、截断、失败不阻塞、git 上限与参数容错
3. **ChatEngine 注入**（已完成）：buildContext 异步化，`<referenced-context>` 块注入 + 24k 预算截断单测；@技能 引用与 injectedSkills 合并去重；额外实现**多轮在场**——从最近历史用户消息回收引用（去重，取最近 8 条）
4. **IPC 链路**（已完成）：main.ts/preload/ChatService 透传 + `ElectronAPI` 接口同步 + mention_references 持久化往返 + 消息列表返回 references；@Git 适配器复用日报管线（GitCacheManager 缓存 + 身份解析）
5. **useMentions + Picker**：触发/过滤/选择/移除状态机；文件路径输入；Git 时间段选择
6. **ChipsBar + 气泡标签**：发送链路接线 + messageAdapter 来源徽章
7. **打磨**：FTS 搜索记忆、最近文件引用记忆、空态文案

## 8. 验收标准

- `帮我写周报 @Git[本周]` 一次发送即可得到基于真实提交的周报，无需先去 WorkGround 手动生成
- @文件 引用一个 16KB 以内的 ts 文件后追问其内容，回答正确
- 断网/文件缺失/记忆被删时，发送不失败，引用块以"来源不可用"占位
- 重启应用后历史消息的来源标签仍正确渲染（references 持久化）
- type-check 0 错误，vitest 全量通过
