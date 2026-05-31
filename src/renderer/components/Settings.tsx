import { useState, useEffect } from 'react';
import { Save, RotateCcw, Key, Palette, Globe, ChevronRight } from 'lucide-react';
import LLMConfiguration from './LLMConfiguration';
import { useTheme } from './ThemeProvider';
import { themePresets } from '@/lib/themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';

type SubPage = 'llm' | null;

export default function Settings() {
  const { theme, setTheme: setCtxTheme, colorTheme, setColorTheme } = useTheme();
  const [language, setLanguage] = useState('zh-CN');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const config = await window.electronAPI.config.getAll();
      setLanguage(config.language || 'zh-CN');
      setAutoUpdate(config.autoUpdate !== false);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await window.electronAPI.config.set('language', language);
      await window.electronAPI.config.set('autoUpdate', autoUpdate);
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
        await loadSettings();
      } catch (error) {
        console.error('Failed to reset settings:', error);
      }
    }
  };

  if (subPage === 'llm') {
    return <LLMConfiguration onBack={() => setSubPage(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1 text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure your 铭</p>
        </div>

        <Card className="mb-4 rounded-xl bg-[var(--surface)] border-[hsl(var(--border))]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Palette size={18} className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Appearance</CardTitle>
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

        <Card className="mb-4 rounded-xl bg-[var(--surface)] border-[hsl(var(--border))]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10">
                <Globe size={18} className="text-emerald-500" />
              </div>
              <div>
                <CardTitle className="text-base">General</CardTitle>
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

        <button
          type="button"
          onClick={() => setSubPage('llm')}
          className="w-full text-left mb-4"
        >
          <Card className="rounded-xl bg-[var(--surface)] border-[hsl(var(--border))] hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-warning/10">
                    <Key size={18} className="text-warning" />
                  </div>
                  <div>
                    <CardTitle className="text-base">LLM Configuration</CardTitle>
                    <CardDescription>API keys, models, and default provider for Agent chat</CardDescription>
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </button>

        <div className="flex gap-3 justify-end pb-8">
          <Button
            variant="secondary"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-xl"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
