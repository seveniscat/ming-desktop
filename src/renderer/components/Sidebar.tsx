import { LayoutDashboard, MessageSquare, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../App';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { theme, setTheme } = useTheme();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'agents', label: 'Agents', icon: MessageSquare },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark';
    setTheme(next);
  };

  return (
    <div className="w-64 flex flex-col bg-secondary border-r">
      {/* macOS drag bar */}
      <div className="drag-region flex-shrink-0 h-8" />
      {/* Logo */}
      <div className="p-6 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg bg-primary">
            銘
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">銘</h1>
            <p className="text-xs text-muted-foreground">Desktop Client</p>
          </div>
        </div>
        <Separator className="mt-6" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <Button
              key={item.id}
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3 px-4 py-3 h-auto',
                isActive && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
              )}
              onClick={() => onTabChange(item.id)}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Button>
          );
        })}
      </nav>

      {/* Footer with theme toggle */}
      <div className="p-4">
        <Separator className="mb-4" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">銘 v0.1.0</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
          >
            {theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
