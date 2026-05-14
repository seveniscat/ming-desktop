import { useState } from 'react';
import { LayoutDashboard, MessageSquare, Bot, Settings, Sun, Moon, Monitor, Home, Search, PanelLeftClose, PanelLeft, Wrench, FileText, Bug } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function Sidebar({ activeTab, onTabChange, collapsed: controlledCollapsed, onCollapsedChange }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const setCollapsed = onCollapsedChange || setInternalCollapsed;

  const menuItems = [
    { id: 'welcome', label: 'Welcome', icon: Home },
    { id: 'dashboard', label: 'WorkGround', icon: LayoutDashboard },
    { id: 'techstack', label: 'TechStack Analyzer', icon: Search },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'agents', label: 'Agents', icon: Bot },
    { id: 'skills', label: 'Skills', icon: Wrench },
    { id: 'prompts', label: 'Prompts', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
  };

  const openDebugPanelFallback = () => {
    const debugUrl = new URL(window.location.href);
    debugUrl.searchParams.set('view', 'debug');
    window.open(
      debugUrl.toString(),
      'ming-debug-panel',
      'popup=yes,width=1200,height=760,resizable=yes,scrollbars=yes'
    );
  };

  const openDebugPanel = async () => {
    try {
      await window.electronAPI?.debug?.openPanel();
    } catch (error) {
      console.warn('Falling back to renderer-opened debug panel window:', error);
      openDebugPanelFallback();
    }
  };

  return (
    <div className={cn('flex flex-col bg-secondary border-r transition-all duration-300', collapsed ? 'w-16' : 'w-64')}>
      {/* macOS drag bar */}
      <div className="drag-region flex-shrink-0 h-8" />
      {/* Logo */}
      <div className={cn('pt-2', collapsed ? 'p-3' : 'p-6')}>
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-3')}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg bg-primary">
            銘
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-foreground">銘</h1>
              <p className="text-xs text-muted-foreground">Desktop Client</p>
            </div>
          )}
        </div>
        <Separator className="mt-6" />
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 space-y-2', collapsed ? 'p-2' : 'p-4')}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <Button
              key={item.id}
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3 h-auto',
                collapsed ? 'px-0 py-3 flex-col' : 'px-4 py-3',
                isActive && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
              )}
              onClick={() => onTabChange(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Button>
          );
        })}
      </nav>

      {/* Footer with theme toggle and collapse */}
      <div className={cn('border-t', collapsed ? 'p-2' : 'p-4')}>
        {!collapsed && <Separator className="mb-4" />}
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between')}>
          {!collapsed && <span className="text-xs text-muted-foreground">銘 v0.1.0</span>}
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-1')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={openDebugPanel}
              title="Open debug panel"
            >
              <Bug size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
            >
              {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
