import { useMemo, useState } from 'react';
import { format, subYears, startOfWeek, addDays, startOfDay, getMonth } from 'date-fns';
import { cn } from '@/lib/utils';

interface HeatmapData {
  data: Record<string, number>;
  stats: {
    totalCommits: number;
    longestStreak: number;
    currentStreak: number;
    mostActiveMonth: string;
    mostActiveDay: string;
  };
}

interface GitHeatmapProps {
  heatmapData: HeatmapData | null;
  isLoading: boolean;
}

function getColorLevel(count: number): string {
  if (count === 0) return 'bg-transparent';
  if (count <= 2) return 'bg-green-200 dark:bg-green-900';
  if (count <= 5) return 'bg-green-400 dark:bg-green-700';
  if (count <= 9) return 'bg-green-600 dark:bg-green-500';
  return 'bg-green-800 dark:bg-green-400';
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface TooltipInfo {
  date: string;
  count: number;
  x: number;
  y: number;
}

export default function GitHeatmap({ heatmapData, isLoading }: GitHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const { cells, monthLabels } = useMemo(() => {
    const today = startOfDay(new Date());
    const oneYearAgo = subYears(today, 1);
    const startDate = startOfWeek(oneYearAgo, { weekStartsOn: 0 });

    const cells: { date: Date; dateStr: string; count: number }[] = [];
    let current = new Date(startDate);

    while (current <= today) {
      const dateStr = format(current, 'yyyy-MM-dd');
      cells.push({
        date: new Date(current),
        dateStr,
        count: heatmapData?.data[dateStr] || 0,
      });
      current = addDays(current, 1);
    }

    // Pad to full weeks
    while (cells.length % 7 !== 0) {
      const dateStr = format(current, 'yyyy-MM-dd');
      cells.push({
        date: new Date(current),
        dateStr,
        count: heatmapData?.data[dateStr] || 0,
      });
      current = addDays(current, 1);
    }

    const numWeeks = cells.length / 7;

    // Calculate month label positions
    const monthLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let week = 0; week < numWeeks; week++) {
      const sundayDate = cells[week * 7].date;
      const month = getMonth(sundayDate);
      if (month !== lastMonth) {
        monthLabels.push({ label: MONTH_LABELS[month], col: week });
        lastMonth = month;
      }
    }

    return { cells, monthLabels, numWeeks };
  }, [heatmapData]);

  const numWeeks = cells.length / 7;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Loading heatmap...
      </div>
    );
  }

  const stats = heatmapData?.stats;

  return (
    <div>
      {/* Heatmap grid */}
      <div className="relative overflow-x-auto">
        {/* Month labels */}
        <div className="relative h-4 ml-8 mb-1" style={{ width: numWeeks * 14 }}>
          {monthLabels.map(({ label, col }, i) => (
            <span
              key={i}
              className="text-[10px] text-muted-foreground absolute"
              style={{ left: col * 14 }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Grid with day labels */}
        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col shrink-0" style={{ width: 32 }}>
            {DAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="text-[10px] text-muted-foreground text-right pr-1"
                style={{ height: 13, lineHeight: '13px' }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Cells grid */}
          <div
            className="grid"
            style={{
              gridTemplateRows: 'repeat(7, 11px)',
              gridTemplateColumns: `repeat(${numWeeks}, 11px)`,
              gap: '2px',
            }}
          >
            {cells.map((cell) => (
              <div
                key={cell.dateStr}
                className={cn(
                  'rounded-sm cursor-pointer transition-colors',
                  getColorLevel(cell.count)
                )}
                style={{ width: 11, height: 11 }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    date: cell.dateStr,
                    count: cell.count,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 px-2 py-1 text-xs rounded-md bg-popover text-popover-foreground border shadow-md pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y - 36,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="font-medium">{tooltip.count}</span> commit{tooltip.count !== 1 ? 's' : ''} on {tooltip.date}
          </div>
        )}
      </div>

      {/* Legend + Stats */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>Less</span>
          <div className="rounded-sm border border-border" style={{ width: 11, height: 11 }} />
          <div className="rounded-sm bg-green-200 dark:bg-green-900" style={{ width: 11, height: 11 }} />
          <div className="rounded-sm bg-green-400 dark:bg-green-700" style={{ width: 11, height: 11 }} />
          <div className="rounded-sm bg-green-600 dark:bg-green-500" style={{ width: 11, height: 11 }} />
          <div className="rounded-sm bg-green-800 dark:bg-green-400" style={{ width: 11, height: 11 }} />
          <span>More</span>
        </div>

        {stats && (
          <div className="flex items-center gap-4">
            {stats.mostActiveMonth && (
              <span>Most Active Month: <strong className="text-foreground">{format(new Date(stats.mostActiveMonth + '-01'), 'MMM yyyy')}</strong></span>
            )}
            {stats.mostActiveDay && (
              <span>Most Active Day: <strong className="text-foreground">{stats.mostActiveDay}</strong></span>
            )}
            {stats.longestStreak > 0 && (
              <span>Longest Streak: <strong className="text-foreground">{stats.longestStreak}d</strong></span>
            )}
            {stats.currentStreak > 0 && (
              <span>Current Streak: <strong className="text-foreground">{stats.currentStreak}d</strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
