# Ming（铭）

本地优先的个人 AI 工作台。数据全部存在你自己的机器上（SQLite），模型由你自己的 API Key 决定。

Ming 围绕一条主线构建：**它知道你做了什么**——自动采集本地 Git 工作痕迹，随时生成日报/周报，并且这些工作数据可以在对话中直接引用。

## 核心能力

- **Chat**：多模型流式对话（含思考过程展示、工具调用执行详情），支持技能注入、提示词变量、长期记忆建议
- **WorkGround**：扫描本地 Git 仓库，聚合你的提交记录（多身份识别），生成日报/周报，附带提交热力图与连续提交统计，结果持久缓存
- **Providers**：多 LLM Provider 管理（OpenAI / Anthropic / Qwen / DeepSeek / Groq / OpenRouter / Ollama / 自定义 / Claude Agent SDK），支持拉取模型列表、连接测试，以及**从 cc-switch 一键导入**现有配置
- **Skills**：Claude Code 兼容的文件夹式技能（SKILL.md + 附属文件），支持编辑、ZIP 导入、本地同步、在 IDE 中打开
- **MCP**：完整的 MCP 客户端（stdio + SSE），服务器管理、工具浏览/测试、协议级调试日志
- **Memories**：长期记忆（FTS5 全文检索），分类管理、上下文预览、token 估算
- **Prompts**：提示词模板库，`{variable}` 变量提取、触发词、在线测试
- **DevTools**：技术栈分析器（拖入 .dmg/.app 或选择项目目录，识别框架与依赖）
- **调试面板**：模型调用日志流、UI 卡顿上报、性能监视

## 快速开始

### 前置要求

- Node.js >= 18，npm >= 9
- Python 3 + git（日报生成脚本依赖）
- 一个 LLM API Key（OpenAI 兼容或 Anthropic 均可）

### 安装与运行

```bash
npm install --legacy-peer-deps   # 存在已知 peer 依赖冲突，必须带此参数
npm run dev
```

启动后到 **Providers** 页添加模型配置（如果你在用 cc-switch，点导入按钮一键迁移），然后即可使用 Chat 与 WorkGround。

日报脚本也可以脱离 GUI 单独运行：

```bash
REPO_PATHS=/path/to/git/repo DAILY_REPORT_OUTPUT_DIR=/tmp/ming-reports \
  python3 scripts/generate_daily_report.py
```

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式（electron-vite，主进程 + 渲染层热重载） |
| `npm run build` | 生产构建到 `dist/` |
| `npm run type-check` | TypeScript 全量检查（当前 0 错误） |
| `npm test -- --run` | Vitest 单测（主进程服务与工具集） |
| `npm run lint` | ESLint（仓库尚未提交 ESLint 配置，暂不可用） |

## 架构与文档

- [ARCHITECTURE.md](ARCHITECTURE.md) — 模块划分、IPC 分组、数据库 schema
- [DEVELOPMENT.md](DEVELOPMENT.md) — 开发环境、目录结构、测试与迁移指南
- [QUICKSTART.md](QUICKSTART.md) — 面向使用者的 5 分钟上手
- `docs/plans/` — 历次功能的设计与实施文档（spec 驱动开发）
- `AGENTS.md` — Cloud 开发环境的注意事项

## 路线图

- [ ] **@ 原语**：输入框支持 @记忆 / @技能 / @文件 / @Git工作数据，统一所有能力的上下文入口
- [ ] **定时自动化**：日报/周报定时生成 + 本地通知/推送
- [ ] **Git 上下文接入对话**："我这周干了什么"直接可问
- [ ] **记忆对象化**：记忆可被 @ 引用、可置顶、带预算

> `src/main/coding/` 下有一套自研的模型无关 agentic coding loop（学习性质，含完整测试），当前未接入产品 UI，保留备用。
