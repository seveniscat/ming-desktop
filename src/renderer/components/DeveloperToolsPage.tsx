import { useState } from 'react';
import { ArrowLeft, Search, LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import TechStackAnalyzer from './TechStackAnalyzer';

interface DevTool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  component: React.ComponentType;
}

const devTools: DevTool[] = [
  {
    id: 'techstack-analyzer',
    name: '技术栈分析器',
    description: '分析应用程序和项目的技术栈组成',
    icon: Search,
    component: TechStackAnalyzer,
  },
];

export default function DeveloperToolsPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const currentTool = devTools.find((t) => t.id === activeTool);

  if (currentTool) {
    const ToolComponent = currentTool.component;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[hsl(var(--border))] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTool(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            <span>开发者工具</span>
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{currentTool.name}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ToolComponent />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold">开发者工具</h1>
        <p className="text-sm text-muted-foreground mt-1">面向开发者的实用工具集</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <motion.button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'flex flex-col items-start gap-3 p-5 rounded-xl border border-[hsl(var(--border))]',
                  'bg-[var(--surface)] hover:bg-[var(--surface-hover)]',
                  'text-left transition-colors group'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Icon size={20} />
                </div>
                <div>
                  <div className="font-medium text-sm group-hover:text-primary transition-colors">{tool.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{tool.description}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
