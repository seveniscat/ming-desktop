import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { ExecutorService } from '../services/ExecutorService';
import { ConfigManager } from '../services/ConfigManager';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'daily-report',
    description: '收集 Git 仓库的提交记录。返回 JSON 格式的提交数据（按仓库分组），用于生成工作日报。',
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          description: '时间范围',
          enum: ['today', 'yesterday', 'week'],
        },
        sinceDate: {
          type: 'string',
          description: '自定义起始日期 (YYYY-MM-DD)',
        },
        untilDate: {
          type: 'string',
          description: '自定义结束日期 (YYYY-MM-DD)',
        },
        repoPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Git 仓库路径列表。留空则使用 Settings 中配置的 workPaths',
        },
      },
    },
  },
};

export function createDailyReportTool(
  configManager: ConfigManager,
  executorService: ExecutorService
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      const storedPaths = configManager.get('workPaths', []) as string[];
      const home = process.env.HOME || '';

      const repoPaths: string[] =
        params.repoPaths?.length > 0
          ? params.repoPaths
          : storedPaths.filter(Boolean);

      const scriptPath = path.join(__dirname, '../../scripts/generate_daily_report.py');

      const env: Record<string, string> = {
        REPO_PATHS: repoPaths.join(','),
        TIME_RANGE: params.timeRange || 'today',
        INCLUDE_ALL_BRANCHES: 'true',
        DAILY_REPORT_TEMPLATE: '',
        DAILY_REPORT_OUTPUT_DIR: path.join(home, 'daily-reports'),
        DAILY_REPORT_OUTPUT_FORMAT: 'json',
      };

      if (params.sinceDate) env.SINCE_DATE = params.sinceDate;
      if (params.untilDate) env.UNTIL_DATE = params.untilDate;

      const result = await executorService.executeCommand(`python3 ${scriptPath}`, {
        cwd: home || undefined,
        env,
      });

      if (result.exitCode !== 0) {
        Logger.error('Daily report tool failed:', result.stderr);
        return JSON.stringify({ error: result.stderr, commits: [] });
      }

      const stdout = result.stdout || '';
      const outputMatch = stdout.match(/__OUTPUT_FILE__:(.+)/);
      const reportPath = outputMatch ? outputMatch[1].trim() : '';

      let commits: any[] = [];
      if (reportPath && reportPath.endsWith('.json')) {
        try {
          const jsonStr = await fs.readFile(reportPath, 'utf-8');
          const jsonData = JSON.parse(jsonStr);
          commits = jsonData.commits || [];
        } catch {
          // Fall through
        }
      }

      return JSON.stringify({ commits });
    },
  };
}
