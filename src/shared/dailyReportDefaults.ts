/** 日报 Markdown 模板占位符：{date} {total_commits} {total_repos} {work_hours} {commit_details} {stats} {generated_at} */
export const DEFAULT_DAILY_REPORT_TEMPLATE = `# 工作日报 - {date}

## 📋 概览
- 提交总数: {total_commits}
- 涉及仓库: {total_repos} 个
- 工作时间: {work_hours} 小时

## 📝 详细内容

{commit_details}

## 📊 统计
{stats}

---
*生成时间: {generated_at}*
`;

/** Daily Reporter Agent 的默认系统提示词（可在设置中覆盖） */
export const DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT = `你是一个工作日报生成助手。用户会提供 Git 提交记录，你需要将其整理为一份专业的中文工作日报。

规则：
- 按项目分类罗列完成的工作事项
- 用简洁清晰的语言描述每项工作
- 不需要展示提交次数、代码变更行数等统计信息
- 保持专业语气
- 用户可能会追问或要求修改，灵活响应`;
