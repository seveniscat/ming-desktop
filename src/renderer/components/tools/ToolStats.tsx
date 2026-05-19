import { Activity, Clock, Calendar, Hash } from 'lucide-react';
import type { ToolRecord } from '../../../shared/types';

interface ToolStatsProps {
  tool: ToolRecord;
}

export default function ToolStats({ tool }: ToolStatsProps) {
  const stats = [
    { label: 'Total Calls', value: tool.usage_count.toString(), icon: Activity },
    { label: 'Last Used', value: tool.last_used_at ? new Date(tool.last_used_at).toLocaleString() : 'Never', icon: Clock },
    { label: 'Created', value: new Date(tool.created_at).toLocaleString(), icon: Calendar },
    { label: 'Updated', value: new Date(tool.updated_at).toLocaleString(), icon: Calendar },
    { label: 'ID', value: tool.id, icon: Hash },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Usage Statistics</h3>
      <div className="rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 px-4 py-3">
              <Icon size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground w-24 shrink-0">{stat.label}</span>
              <span className="text-sm font-mono">{stat.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
