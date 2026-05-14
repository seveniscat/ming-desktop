import { useState, useEffect } from 'react';
import { Save, RotateCcw, Key, Settings as SettingsIcon, Palette, Globe, FolderOpen, Plus, X } from 'lucide-react';
import LLMConfiguration from './LLMConfiguration';
import { useTheme } from './ThemeProvider';
import { themePresets } from '@/lib/themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { theme, setTheme: setCtxTheme, colorTheme, setColorTheme } = useTheme();
  const [language, setLanguage] = useState('zh-CN');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [workPaths, setWorkPaths] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const config = await window.electronAPI.config.getAll();
      setLanguage(config.language || 'zh-CN');
      setAutoUpdate(config.autoUpdate !== false);
      if (Array.isArray(config.workPaths)) {
        setWorkPaths(config.workPaths);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await window.electronAPI.config.set('language', language);
      await window.electronAPI.config.set('autoUpdate', autoUpdate);
      await window.electronAPI.config.set('workPaths', workPaths);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      try {
        setCtxTheme('dark');
        await window.electronAPI.config.set('language', 'zh-CN');
        await window.electronAPI.config.set('autoUpdate', true);
        await window.electronAPI.config.set('workPaths', []);
        await loadSettings();
      } catch (error) {
        console.error('Failed to reset settings:', error);
      }
    }
  };

  const handleAddPath = async () => {
    try {
      const result = await window.electronAPI.dialog.showOpenDialog({
        title: '选择工作目录',
        properties: ['openDirectory', 'multiSelections'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const newPaths = [...workPaths];
        for (const p of result.filePaths) {
          if (!newPaths.includes(p)) {
            newPaths.push(p);
          }
        }
        setWorkPaths(newPaths);
        await window.electronAPI.config.set('workPaths', newPaths);
      }
    } catch (error) {
      console.error('Failed to open dialog:', error);
    }
  };

  const handleRemovePath = async (index: number) => {
    const newPaths = workPaths.filter((_, i) => i !== index);
    setWorkPaths(newPaths);
    await window.electronAPI.config.set('workPaths', newPaths);
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Settings</h1>
          <p className="text-muted-foreground">Configure your 銘</p>
        </div>

        {/* Appearance */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent">
                <Palette size={20} className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Appearance</CardTitle>
                <CardDescription>Customize the look and feel</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Theme</Label>
                <Select value={theme} onValueChange={(v) => setCtxTheme(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">Auto (System)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Color Theme</Label>
                <div className="grid grid-cols-5 gap-2">
                  {themePresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setColorTheme(preset.name)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors',
                        colorTheme === preset.name
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div
                        className="w-6 h-6 rounded-full border border-border"
                        style={{ background: `hsl(${preset.dark['--primary']})` }}
                      />
                      <span className="text-xs text-muted-foreground">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* General */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Globe size={20} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-lg">General</CardTitle>
                <CardDescription>General application settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Auto Update</div>
                <div className="text-sm text-muted-foreground">Automatically check for updates</div>
              </div>
              <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
            </div>
          </CardContent>
        </Card>

        {/* Work Paths */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <SettingsIcon size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Work Paths</CardTitle>
                <CardDescription>Select your project directories for daily reports</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {workPaths.map((path, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 rounded-lg bg-input border"
                >
                  <FolderOpen size={16} className="flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm truncate text-foreground">{path}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemovePath(index)}
                    className="flex-shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}

              {workPaths.length === 0 && (
                <p className="text-sm py-2 text-muted-foreground">
                  No paths configured. Click "Add Folder" to get started.
                </p>
              )}

              <Button
                variant="secondary"
                onClick={handleAddPath}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Add Folder
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* LLM Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Key size={20} className="text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <CardTitle className="text-lg">LLM Configuration</CardTitle>
                <CardDescription>API keys, models, and default provider for Agent chat</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <LLMConfiguration />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RotateCcw size={18} />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
