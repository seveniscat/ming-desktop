import { BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { IPCChannels } from '../../shared/ipc-channels';
import { Logger } from '../utils/Logger';

export type UpdateStatusEvent =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'downloading'; progress: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export class UpdateService {
  private currentStatus: UpdateStatusEvent = { status: 'idle' };
  private latestInfo: UpdateInfo | null = null;

  constructor() {
    // 不自动下载，由用户手动触发
    autoUpdater.autoDownload = false;
    // 不自动安装退出，由用户触发
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  private setupListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      Logger.info('[UpdateService] Checking for update...');
      this.broadcast({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      Logger.info(`[UpdateService] Update available: ${info.version}`);
      this.latestInfo = info;
      this.broadcast({
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes as string | undefined,
      });
    });

    autoUpdater.on('update-not-available', () => {
      Logger.info('[UpdateService] App is up-to-date');
      this.broadcast({ status: 'up-to-date' });
    });

    autoUpdater.on('download-progress', (progressInfo) => {
      this.broadcast({
        status: 'downloading',
        progress: Math.round(progressInfo.percent),
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      Logger.info(`[UpdateService] Update downloaded: ${info.version}`);
      this.broadcast({
        status: 'downloaded',
        version: info.version,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      Logger.error('[UpdateService] Error:', error);
      this.broadcast({
        status: 'error',
        message: error.message,
      });
    });
  }

  private broadcast(event: UpdateStatusEvent): void {
    this.currentStatus = event;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPCChannels.UPDATE_STATUS_EVENT, event);
      }
    }
  }

  getStatus(): UpdateStatusEvent {
    return this.currentStatus;
  }

  async checkForUpdates(): Promise<{ hasUpdate: boolean; version?: string; releaseNotes?: string }> {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        const currentVersion = autoUpdater.currentVersion.toString();
        const newVersion = result.updateInfo.version;
        const hasUpdate = newVersion !== currentVersion;
        return {
          hasUpdate,
          version: newVersion,
          releaseNotes: result.updateInfo.releaseNotes as string | undefined,
        };
      }
      return { hasUpdate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.broadcast({ status: 'error', message });
      return { hasUpdate: false };
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.broadcast({ status: 'error', message });
    }
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }
}
