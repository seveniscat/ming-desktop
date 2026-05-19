import { BrowserWindow, ipcMain } from 'electron';
import { IPCChannels } from '../../shared/ipc-channels';
import { Logger } from '../utils/Logger';

export class ToolApprovalManager {
  private pending: Map<string, { resolve: (approved: boolean) => void }> = new Map();

  constructor() {
    ipcMain.on(IPCChannels.TOOL_APPROVAL_RESPONSE, (_event, requestId: string, approved: boolean) => {
      const pending = this.pending.get(requestId);
      if (pending) {
        pending.resolve(approved);
        this.pending.delete(requestId);
      }
    });
  }

  async requestApproval(
    mainWindow: BrowserWindow,
    toolName: string,
    params: Record<string, any>,
  ): Promise<boolean> {
    const requestId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    return new Promise((resolve) => {
      this.pending.set(requestId, { resolve });

      mainWindow.webContents.send(IPCChannels.TOOL_APPROVAL_REQUEST, {
        requestId,
        toolName,
        params,
      });

      // Auto-deny after 60s
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          Logger.info(`Tool approval timed out for ${toolName}, auto-denying`);
          resolve(false);
        }
      }, 60000);
    });
  }
}
