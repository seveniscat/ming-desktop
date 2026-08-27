# Ming - 快速上手

5 分钟从安装到用起来。

## 1. 安装与启动

```bash
npm install --legacy-peer-deps
npm run dev
```

## 2. 配置模型（Providers）

没有模型什么都做不了，先做这个：

1. 左侧导航进入 **Providers**
2. 选择预设（OpenAI / Anthropic / Qwen / DeepSeek / Groq / OpenRouter / Ollama / 自定义），填入 API Key 和 Base URL
3. 点击 **拉取模型**，选中要用的模型，**测试连接** 通过后保存
4. 已在用 cc-switch？直接点导入图标，一键迁移全部 provider 配置

用本地 Ollama 的话选 Ollama 预设，默认地址 `http://localhost:11434/v1`。

## 3. 生成第一份日报（WorkGround）

1. 左侧导航进入 **WorkGround**
2. 首次使用先在身份选择器里勾选"哪些 git 身份是我"（支持多个 name/email）
3. 选择时间范围（今天 / 昨天 / 自定义），点击刷新
4. 查看提交明细与统计，点击生成日报；不满意可以一键转交 Chat 让 AI 重写
5. 历史报告自动保存在报告历史列表中

## 4. 开始对话（Chat）

1. 进入 **Chat**，新建会话
2. 输入 `/` 唤起技能与提示词模板（内置日报/周报生成器）
3. 模型选择器可随时切换模型；助手回答支持思考过程与工具调用详情展开

## 5. 进阶玩法

- **Skills**：把常用的 Claude Code 技能文件夹导入进来，或直接写 SKILL.md
- **MCP**：添加 stdio/SSE 的 MCP 服务器，其工具自动进入对话可用范围
- **Memories**：把偏好和背景沉淀为长期记忆，对话时会自动带上
- **DevTools**：把别人的 .app 拖进来分析技术栈

## 常见问题

- **安装失败**：peer 依赖冲突，务必用 `npm install --legacy-peer-deps`
- **数据库崩溃**：原生模块问题，重跑 `npx electron-rebuild`
- **日报为空**：确认仓库路径在扫描范围内、身份勾选正确、时间范围覆盖提交日期
- **开发环境（Cloud VM）**：详见 `AGENTS.md`
