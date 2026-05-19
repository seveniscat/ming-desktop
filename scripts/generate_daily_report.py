#!/usr/bin/env python3
"""
Daily Work Report Generator - 优化版
根据Git提交记录自动生成工作日报

优化点：
1. 快速过滤：只处理今天有改动的仓库
2. 全分支支持：不会遗漏切换分支后的提交
"""

import subprocess
from datetime import datetime, timedelta
from pathlib import Path
import os
import sys
import time
import json


def _apply_report_template(template: str, **placeholders: str) -> str:
    """按键替换占位符，避免用户模板中含 {{}} 时 str.format 报错。"""
    out = template
    for key, val in placeholders.items():
        out = out.replace("{" + key + "}", str(val))
    return out

# 配置区域
CONFIG = {
    # 仓库路径 - 支持目录自动扫描
    "base_paths": [
        "~/bzdev/bkdev",
        "~/bzdev/exdev",
    ],

    # 是否自动扫描子目录中的Git仓库
    "auto_scan_subdirs": True,

    # 最大扫描深度（避免扫描过深）
    "max_scan_depth": 3,

    # 日报模板
    "template": """# 工作日报 - {date}

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
""",

    # 时间范围（用于计算今天/本周的提交）
    "time_range": "today",  # "today", "yesterday", "week", "custom"

    # 是否包含所有分支（防止切换分支后遗漏提交）
    "include_all_branches": True,

    # 按作者过滤（可选，只看自己的提交）
    "filter_by_authors": None,  # None = 不过滤，或设置 [Git用户名] 列表

    # 输出路径
    "output_dir": "~/daily-reports",

    # 输出格式: "markdown", "txt", "json"
    "output_format": "markdown",
}


def find_git_repos(base_path, max_depth=3):
    """递归查找目录中的所有Git仓库"""
    base_path = Path(base_path).expanduser()
    repos = []

    if not base_path.exists():
        print(f"⚠️  路径不存在: {base_path}")
        return repos

    # 检查当前目录是否是Git仓库
    if (base_path / ".git").exists():
        repos.append(str(base_path))

    # 递归扫描子目录
    for item in base_path.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            if max_depth > 0:
                repos.extend(find_git_repos(item, max_depth - 1))

    return repos


def _add_author_args(cmd, authors):
    """Add --author flags for one or multiple authors (git OR-matches multiple --author)."""
    if not authors:
        return
    for a in authors:
        cmd.extend(["--author", a])


def has_commits_today(repo_path, since_date, until_date=None, include_all_branches=True, authors=None):
    """快速检查仓库在指定时间范围内是否有提交"""
    try:
        cmd = [
            "git", "-C", repo_path,
            "log",
            f"--since={since_date}",
            "--oneline",
            "--all" if include_all_branches else None,
        ]
        cmd = [c for c in cmd if c is not None]

        if until_date:
            cmd.append(f"--until={until_date}")

        _add_author_args(cmd, authors)

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        lines = [l for l in result.stdout.strip().split('\n') if l.strip()]
        count = len(lines)
        return count > 0, count
    except Exception:
        return False, 0


def get_git_commits(repo_path, since_date, until_date=None, include_all_branches=True, authors=None):
    """获取指定时间范围内的Git提交记录（详细）"""
    try:
        cmd = [
            "git", "-C", repo_path,
            "log",
            f"--since={since_date}",
            "--pretty=format:%H|%ai|%an|%s|%b",  # 增加了 %b 获取提交的详细描述
            "--stat"
        ]

        if until_date:
            cmd.append(f"--until={until_date}")

        if include_all_branches:
            cmd.append("--all")

        _add_author_args(cmd, authors)

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        return ""
    except Exception as e:
        return ""


def parse_commits(git_output, repo_name):
    """解析Git输出，结构化提交信息"""
    commits = []
    lines = git_output.strip().split('\n')
    current_commit = None

    for line in lines:
        if '|' in line and line.count('|') >= 4:
            # 这是提交信息行
            parts = line.split('|')
            if len(parts) >= 4:
                if current_commit:
                    commits.append(current_commit)

                # 获取分支信息
                branches = ""
                if parts[4]:  # 如果有详细描述
                    desc_lines = parts[4].strip().split('\n')
                    for desc_line in desc_lines:
                        if 'branch' in desc_line.lower() or 'merge' in desc_line.lower():
                            branches = desc_line.strip()

                current_commit = {
                    "hash": parts[0][:7],
                    "date": parts[1],
                    "author": parts[2],
                    "message": parts[3],
                    "description": parts[4] if len(parts) > 4 else "",
                    "repo": repo_name,
                    "files_changed": [],
                    "additions": 0,
                    "deletions": 0,
                    "branches": branches
                }
        elif current_commit and line.strip():
            # 这是文件变更统计行
            if 'files changed' in line:
                parts = line.split(',')
                for part in parts:
                    if 'insertion' in part:
                        try:
                            current_commit["additions"] += int(part.strip().split()[0])
                        except (ValueError, IndexError):
                            pass
                    elif 'deletion' in part:
                        try:
                            current_commit["deletions"] += int(part.strip().split()[0])
                        except (ValueError, IndexError):
                            pass
            elif line.strip() and not line.startswith(' '):
                current_commit["files_changed"].append(line.strip())

    if current_commit:
        commits.append(current_commit)

    return commits


def format_report(commits, date):
    """格式化日报内容"""
    if not commits:
        return "今天没有代码提交记录。"

    # 按仓库分组
    by_repo = {}
    for commit in commits:
        repo = commit["repo"]
        if repo not in by_repo:
            by_repo[repo] = []
        by_repo[repo].append(commit)

    # 按时间排序
    for repo in by_repo:
        by_repo[repo].sort(key=lambda x: x['date'], reverse=True)

    # 构建详细内容
    details = ""
    for repo, repo_commits in by_repo.items():
        details += f"### 📁 {repo}\n\n"
        for i, commit in enumerate(repo_commits, 1):
            details += f"**{i}. {commit['message']}**\n"
            details += f"- 时间: {commit['date'][:16]}\n"
            details += f"- 提交: `{commit['hash']}`\n"

            # 显示分支信息（如果有）
            if commit.get("branches"):
                details += f"- 分支: {commit['branches']}\n"

            if commit['additions'] > 0 or commit['deletions'] > 0:
                details += f"- 代码变更: +{commit['additions']} -{commit['deletions']}\n"

            details += "\n"

    # 统计信息
    stats = f"- 总提交数: {len(commits)}\n"
    stats += f"- 总代码变更: +{sum(c['additions'] for c in commits)} -{sum(c['deletions'] for c in commits)}\n"
    stats += f"- 涉及仓库: {len(by_repo)} 个\n"
    stats += f"- 仓库列表: {', '.join(by_repo.keys())}\n"

    return details, stats


def get_time_range(range_type):
    """获取时间范围"""
    now = datetime.now()

    if range_type == "today":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return since.strftime("%Y-%m-%d %H:%M:%S"), None
    elif range_type == "yesterday":
        yesterday = now - timedelta(days=1)
        since = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        until = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
        return since.strftime("%Y-%m-%d %H:%M:%S"), until.strftime("%Y-%m-%d %H:%M:%S")
    elif range_type == "day_before_yesterday":
        day = now - timedelta(days=2)
        since = day.replace(hour=0, minute=0, second=0, microsecond=0)
        until = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        return since.strftime("%Y-%m-%d %H:%M:%S"), until.strftime("%Y-%m-%d %H:%M:%S")
    elif range_type == "week":
        week_ago = now - timedelta(days=7)
        return week_ago.strftime("%Y-%m-%d %H:%M:%S"), None
    else:
        return now.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S"), None


def generate_report(config=None):
    """生成日报主函数"""
    if config is None:
        config = CONFIG

    # 获取时间范围（优先使用自定义日期）
    since_date_cfg = config.get("since_date")
    until_date_cfg = config.get("until_date")
    if since_date_cfg:
        print(f"📅 使用自定义日期范围: {since_date_cfg} ~ {until_date_cfg or '至今'}")
        try:
            since = datetime.strptime(since_date_cfg, "%Y-%m-%d").strftime("%Y-%m-%d 00:00:00")
            until = None
            if until_date_cfg:
                until = datetime.strptime(until_date_cfg, "%Y-%m-%d").strftime("%Y-%m-%d 23:59:59")
        except ValueError:
            since, until = get_time_range(config.get("time_range", "today"))
    else:
        print(f"📅 使用预设时间范围: {config.get('time_range', 'today')}")
        since, until = get_time_range(config.get("time_range", "today"))

    # 收集所有仓库路径
    repo_paths = []
    if config.get("auto_scan_subdirs"):
        print("🔍 正在扫描Git仓库...")
        start_time = time.time()
        for base_path in config["base_paths"]:
            repos = find_git_repos(base_path, config.get("max_scan_depth", 3))
            repo_paths.extend(repos)
        scan_time = time.time() - start_time
        print(f"✅ 扫描完成: {len(repo_paths)} 个Git仓库 (耗时: {scan_time:.2f}秒)")
    else:
        repo_paths = config["base_paths"]

    if not repo_paths:
        print("⚠️  没有找到任何Git仓库！")
        return "今天没有代码提交记录。", []

    # 快速过滤：只处理今天有提交的仓库
    print(f"🔍 快速检查今天有改动的仓库...")
    start_time = time.time()
    active_repos = []
    include_all_branches = config.get("include_all_branches", True)
    author_filter = config.get("filter_by_authors")  # list of authors

    for repo_path in repo_paths:
        has_commits, count = has_commits_today(
            repo_path,
            since,
            until,
            include_all_branches=include_all_branches,
            authors=author_filter
        )
        if has_commits:
            repo_name = Path(repo_path).name
            active_repos.append((repo_path, repo_name, count))
            print(f"  ✓ {repo_name}: {count} 个提交")

    filter_time = time.time() - start_time
    print(f"✅ 过滤完成: {len(active_repos)} 个仓库今天有改动 (耗时: {filter_time:.2f}秒)")

    if not active_repos:
        print("⚠️  今天没有仓库有提交记录")
        return "今天没有代码提交记录。", []

    # 收集所有提交（只从有改动的仓库）
    print(f"📝 正在获取详细提交信息...")
    start_time = time.time()
    all_commits = []

    for repo_path, repo_name, _ in active_repos:
        git_output = get_git_commits(
            repo_path,
            since,
            until,
            include_all_branches=include_all_branches,
            authors=author_filter
        )

        if git_output:
            commits = parse_commits(git_output, repo_name)
            all_commits.extend(commits)

    fetch_time = time.time() - start_time
    print(f"✅ 获取完成: {len(all_commits)} 个提交 (耗时: {fetch_time:.2f}秒)")

    if not all_commits:
        return "今天没有代码提交记录。", []

    # 格式化报告
    details, stats_text = format_report(all_commits, datetime.now().strftime("%Y-%m-%d"))

    # 填充模板（占位符：date, total_commits, total_repos, work_hours, commit_details, stats, generated_at）
    report = _apply_report_template(
        config["template"],
        date=datetime.now().strftime("%Y年%m月%d日"),
        total_commits=str(len(all_commits)),
        total_repos=str(len(set(c["repo"] for c in all_commits))),
        work_hours=str(round(len(all_commits) * 0.5, 1)),
        commit_details=details,
        stats=stats_text,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )

    return report, all_commits


def save_report(report, config=None, commits=None):
    """保存报告到文件"""
    if config is None:
        config = CONFIG

    output_dir = Path(config["output_dir"]).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    fmt = config["output_format"]

    if fmt == "json" and commits is not None:
        filename = f"daily-report-{today}.json"
        filepath = output_dir / filename
        data = {
            "report": report,
            "commits": commits,
            "stats": {
                "totalCommits": len(commits),
                "totalRepos": len(set(c["repo"] for c in commits)),
                "workHours": round(len(commits) * 0.5, 1),
            }
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"__OUTPUT_FILE__:{filepath}")
        return str(filepath)
    else:
        filename = f"daily-report-{today}.{fmt}"
        filepath = output_dir / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"__OUTPUT_FILE__:{filepath}")
        return str(filepath)


def _config_from_env():
    """从环境变量合并配置（由 Electron 插件注入）。"""
    cfg = {**CONFIG}

    repo_csv = os.environ.get("REPO_PATHS", "").strip()
    if repo_csv:
        cfg["base_paths"] = [p.strip() for p in repo_csv.split(",") if p.strip()]

    tr = os.environ.get("TIME_RANGE", "").strip().lower()
    if tr in ("today", "yesterday", "day_before_yesterday", "week"):
        cfg["time_range"] = tr

    iab = os.environ.get("INCLUDE_ALL_BRANCHES", "").strip().lower()
    if iab in ("0", "false", "no"):
        cfg["include_all_branches"] = False
    elif iab in ("1", "true", "yes"):
        cfg["include_all_branches"] = True

    # Multi-author support: FILTER_BY_AUTHORS takes priority (comma-separated),
    # falls back to single FILTER_BY_AUTHOR for backwards compatibility.
    authors_csv = os.environ.get("FILTER_BY_AUTHORS", "").strip()
    if authors_csv:
        cfg["filter_by_authors"] = [a.strip() for a in authors_csv.split(",") if a.strip()]
    else:
        author = os.environ.get("FILTER_BY_AUTHOR", "").strip()
        if author:
            cfg["filter_by_authors"] = [author]
        elif "FILTER_BY_AUTHOR" in os.environ:
            cfg["filter_by_authors"] = None

    tmpl = os.environ.get("DAILY_REPORT_TEMPLATE", "").strip()
    if tmpl:
        cfg["template"] = tmpl

    out_dir = os.environ.get("DAILY_REPORT_OUTPUT_DIR", "").strip()
    if out_dir:
        cfg["output_dir"] = out_dir

    fmt = os.environ.get("DAILY_REPORT_OUTPUT_FORMAT", "").strip().lower()
    if fmt in ("markdown", "txt", "json"):
        cfg["output_format"] = fmt

    since = os.environ.get("SINCE_DATE", "").strip()
    if since:
        cfg["since_date"] = since

    until = os.environ.get("UNTIL_DATE", "").strip()
    if until:
        cfg["until_date"] = until

    return cfg


def main():
    """主函数"""
    print("🚀 正在生成日报...")
    print("="*60)

    total_start = time.time()
    runtime_config = _config_from_env()

    # 生成报告
    report, commits = generate_report(runtime_config)

    # 保存报告
    filepath = save_report(report, runtime_config, commits)

    total_time = time.time() - total_start

    print("="*60)
    print(f"✨ 总耗时: {total_time:.2f}秒\n")

    # 打印报告
    print(report)
    print("="*60)

    return filepath


if __name__ == "__main__":
    main()
