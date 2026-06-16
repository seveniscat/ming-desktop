import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { ExecutorService } from '../services/ExecutorService';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'execute_command',
    description: 'Execute a shell command and return its output. Supports specifying a working directory and timeout.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command execution',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
  },
};

export function createExecuteCommandTool(
  executorService: ExecutorService
): ToolEntry {
  return {
    definition: DEFINITION,
    requiresApproval: true,
    handler: async (params: Record<string, any>, _ctx?) => {
      try {
        const command = params.command;
        const cwd = params.cwd;
        const timeout = params.timeout ?? 30000;

        const result = await executorService.executeCommand(command, {
          cwd,
          timeout,
        });

        return JSON.stringify({
          command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
          success: result.success,
        });
      } catch (error: any) {
        Logger.error('execute_command tool error:', error);
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
