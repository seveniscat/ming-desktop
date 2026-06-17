import { useState, useEffect } from 'react';
import { Home, LayoutDashboard, MessageSquare, Zap, Wrench, FileText, Search, Settings, Sun, Moon, Monitor, PanelLeftClose, PanelLeft, Bug, Cable, Activity, Brain, Code2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface NavRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'welcome', icon: Home, label: 'Home' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'WorkGround' },
  { id: 'devtools', icon: Search, label: 'DevTools' },
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'coding', icon: Code2, label: 'Coding' },
  { id: 'skills', icon: Zap, label: 'Skills' },
  { id: 'tools', icon: Wrench, label: 'Tools' },
  { id: 'mcp-servers', icon: Cable, label: 'MCP' },
  { id: 'mcp-debug', icon: Activity, label: 'MCP Debug' },
  { id: 'prompts', icon: FileText, label: 'Prompts' },
  { id: 'memories', icon: Brain, label: 'Memories' },
];

export default function NavRail({ activeTab, onTabChange }: NavRailProps) {
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  // 订阅更新状态，标记是否有已下载的新版本
  useEffect(() => {
    const unsubscribe = window.electronAPI?.updater?.onStatusChange((data: any) => {
      setHasUpdate(data.status === 'available' || data.status === 'downloaded');
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
  };

  const openDebugPanel = async () => {
    try {
      await window.electronAPI?.debug?.openPanel();
    } catch (error) {
      console.warn('Falling back to renderer-opened debug panel window:', error);
      const debugUrl = new URL(window.location.href);
      debugUrl.searchParams.set('view', 'debug');
      window.open(
        debugUrl.toString(),
        'ming-debug-panel',
        'popup=yes,width=1200,height=760,resizable=yes,scrollbars=yes'
      );
    }
  };

  return (
    <div className={cn(
      'flex flex-col bg-[var(--surface)] border-r border-[hsl(var(--border))] shrink-0 transition-all duration-200',
      collapsed ? 'w-16' : 'w-[200px]'
    )}>
      {/* macOS drag region */}
      <div className="drag-region flex-shrink-0 h-11" />

      {/* Logo */}
      <div className={cn('flex items-center px-3 py-3', collapsed ? 'justify-center' : 'gap-2.5 px-4')}>
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          铭
        </div>
        {!collapsed && <span className="font-semibold text-sm text-foreground">Ming</span>}
      </div>

      {/* Nav items */}
      <nav className={cn('flex-1 flex flex-col gap-0.5 pt-2', collapsed ? 'px-1.5' : 'px-2')}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                'relative flex items-center rounded-lg transition-colors text-sm',
                collapsed ? 'w-11 h-11 justify-center mx-auto' : 'w-full h-9 gap-2.5 px-2.5',
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface-hover)]'
              )}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg bg-primary/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={18} className="relative z-10 shrink-0" />
              {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className={cn('border-t border-[hsl(var(--border))] flex flex-col gap-0.5', collapsed ? 'p-1.5' : 'p-2')}>
        {/* Settings */}
        <button
          type="button"
          onClick={() => onTabChange('settings')}
          className={cn(
            'relative flex items-center rounded-lg transition-colors text-sm',
            collapsed ? 'w-11 h-9 justify-center mx-auto' : 'w-full h-9 gap-2.5 px-2.5',
            activeTab === 'settings'
              ? 'text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface-hover)]'
          )}
          title={collapsed ? 'Settings' : undefined}
        >
          {activeTab === 'settings' && (
            <motion.div
              layoutId="nav-active-settings"
              className="absolute inset-0 rounded-lg bg-primary/10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Settings size={18} className="relative z-10 shrink-0" />
          {!collapsed && <span className="relative z-10">Settings</span>}
          {/* Update badge */}
          {hasUpdate && (
            <span className={cn(
              'absolute rounded-full bg-primary',
              collapsed ? 'top-1 right-0.5 w-2.5 h-2.5' : 'top-1.5 left-7 w-2 h-2'
            )} />
          )}
        </button>

        {/* Action buttons row */}
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-0.5' : 'gap-0.5 px-1 pt-1')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={openDebugPanel}
            title="Debug panel"
          >
            <Bug size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
          >
            {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </Button>
        </div>

        {/* Version */}
        {!collapsed && (
          <div className="px-2.5 pt-1 pb-1 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">铭 v0.1.0</span>
            {hasUpdate && (
              <button
                type="button"
                onClick={() => onTabChange('settings')}
                className="text-[10px] text-primary hover:underline"
              >
                New update
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
