# Ming - 开发指南

## 环境搭建

```bash
git clone <repository-url> && cd ming-desktop
npm install --legacy-peer-deps   # peer 依赖冲突，必须带此参数
npm run dev
```

技术栈：Electron + electron-vite（主进程/preload/渲染三段构建）、React 18 + Tailwind + Radix、better-sqlite3（原生模块，postinstall 自动 electron-rebuild）、Vitest。

## 目录结构

```
src/
├── main/                    # 主进程（Node 环境）
│   ├── main.ts              # 入口：窗口、服务初始化、全部 IPC handler
│   ├── preload.ts           # contextBridge + ElectronAPI 权威类型定义
│   ├── chat/                # ChatEngine（对话+工具循环）、ChatService（会话编排）
│   ├── llm/                 # LLMProviderManager、provider 注册表、双端序列化、cc-switch 导入
│   ├── mcp/                 # MCPManager / McpClient（stdio+SSE、协议日志）
│   ├── skill/               # SkillManager（文件夹式技能）
│   ├── tools/               # ToolExecutor、审批、内置工具（含 daily-report）
│   ├── services/            # Executor/Config/Memory/PromptTemplate/DebugLog/GitCache
│   ├── coding/              # 实验性自研 agentic loop（未接入 UI）
│   ├── database/            # 连接 + schema（顺序命名迁移）
│   ├── techstack/           # 依赖指纹识别
│   └── updater/             # electron-updater 封装
├── renderer/                # 渲染进程（React）
│   ├── App.tsx              # tab 切换式页面容器
│   ├── components/          # 页面组件（Dashboard、chat/、SkillManager…）
│   ├── pages/               # Tools / MCP / Prompts / Memory
│   └── vite-env.d.ts        # 引用 preload 的 ElectronAPI 作为 window 类型
└── shared/                  # 跨进程类型与 IPC 通道常量（@shared 别名）
scripts/generate_daily_report.py   # 日报核心脚本（独立可运行）
docs/plans/                        # spec 驱动的设计/实施文档
```

## 修改代码时

- **新增 IPC**：`shared/ipc-channels.ts` 加枚举 → `main.ts` 注册 handler → `preload.ts` 实现并**同步更新文件底部的 `ElectronAPI` 接口**（渲染层类型唯一来源，漏更会 type-check 报错）
- **新增工具**：`tools/` 下建 `xxxTool.ts`（`ToolEntry` 结构，handler 收 `ToolContext`），注册进 `ToolExecutor`，需要审批的声明 `requiresApproval`
- **数据库变更**：`database/schema.ts` 末尾追加下一个序号的命名迁移（查 `_migrations` 表防重入），不要改历史迁移
- **新功能**：先在 `docs/plans/` 写 design + 任务清单再动手（仓库惯例）

## 测试与检查

```bash
npm run type-check     # 必须 0 错误
npm test -- --run      # Vitest：主进程服务/工具/序列化/coding loop 单测 + 真实 FS 集成测试
```

测试在 `node` 环境运行，覆盖主进程逻辑；渲染层目前无组件测试。集成测试（`coding/integration.test.ts`）用脚本化 LLM + 临时目录真实文件系统。

## 已知事项

- `npm run lint` 不可用（仓库无 ESLint 配置）
- 自动更新 publish 目标未配置（package.json 中 owner/repo 为 TODO），仅本地流程可用
- `install.sh` 引用了不存在的 `build:main` 脚本，勿用
- AGENTS.md 有 Cloud VM 环境的额外注意事项（端口、DISPLAY、IPv6 loopback 等）
