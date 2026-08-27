import { useState, useEffect, useMemo } from 'react';
import { Brain, Zap, FileText, GitBranch, CornerDownLeft } from 'lucide-react';
import type { MentionReference, MentionKind } from '../../../shared/types';
import type { MemoryItem, SkillItem } from './hooks/useMentions';
import { cn } from '@/lib/utils';

interface MentionPickerProps {
  query: string;
  memories: MemoryItem[];
  skills: SkillItem[];
  onPick: (ref: MentionReference) => void;
  onClose: () => void;
}

const KIND_META: Record<MentionKind, { icon: typeof Brain; cls: string; name: string }> = {
  memory: { icon: Brain, cls: 'text-blue-500', name: '记忆' },
  skill: { icon: Zap, cls: 'text-violet-500', name: '技能' },
  git: { icon: GitBranch, cls: 'text-emerald-500', name: 'Git' },
  file: { icon: FileText, cls: 'text-amber-500', name: '文件' },
};

const GIT_PRESETS: { label: string; params: Record<string, string> }[] = [
  { label: '今日提交', params: { timeRange: 'today' } },
  { label: '昨日提交', params: { timeRange: 'yesterday' } },
  { label: '本周提交', params: { timeRange: 'week' } },
];

interface PickerItem {
  kind: MentionKind;
  id: string;
  label: string;
  desc?: string;
  params?: Record<string, string>;
}

/**
 * @ 引用选择器：分组列出记忆/技能/Git 时间段，键盘 ↑↓/Enter/Esc；
 * 底部固定文件路径输入（绝对路径，回车确认）。
 */
export default function MentionPicker({ query, memories, skills, onPick, onClose }: MentionPickerProps) {
  const [selected, setSelected] = useState(0);
  const [filePath, setFilePath] = useState('');

  const items = useMemo<PickerItem[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const arr: PickerItem[] = [];

    for (const m of memories) {
      const label = m.content.length > 26 ? `${m.content.slice(0, 26)}…` : m.content;
      if (match(label) || match(m.category || '')) {
        arr.push({ kind: 'memory', id: m.id, label, desc: m.category || '记忆' });
      }
    }
    for (const s of skills) {
      if (match(s.name) || match(s.description || '')) {
        arr.push({ kind: 'skill', id: s.id, label: s.name, desc: s.description || '技能' });
      }
    }
    for (const p of GIT_PRESETS) {
      if (match(p.label) || match('git 提交')) {
        arr.push({ kind: 'git', id: 'commits', label: p.label, desc: '本地 Git 提交', params: p.params });
      }
    }
    return arr;
  }, [query, memories, skills]);

  useEffect(() => setSelected(0), [query]);

  const pick = (item: PickerItem) =>
    onPick({ kind: item.kind, id: item.id, label: item.label, params: item.params });

  const pickFile = () => {
    const p = filePath.trim();
    if (!p) return;
    const label = p.split('/').pop() || p;
    onPick({ kind: 'file', id: p.startsWith('~') ? p : p, label, params: undefined });
    setFilePath('');
  };

  // 键盘导航：捕获阶段拦截，避免 Enter 触发 composer 发送；文件输入框内只放行 Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.dataset?.mentionFileInput === 'true') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => (items.length ? (i + 1) % items.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
      } else if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault();
        pick(items[selected]);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [items, selected, onClose]);

  return (
    <div
      role="listbox"
      aria-label="引用选择器"
      className="absolute bottom-full left-0 z-50 mb-2 w-[26rem] max-w-full rounded-xl border border-[hsl(var(--border))] bg-popover p-1.5 shadow-lg"
    >
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-2.5 py-3 text-xs text-muted-foreground">
            没有匹配的记忆/技能/Git，可在下方直接输入文件路径
          </div>
        )}
        {items.map((item, i) => {
          const Icon = KIND_META[item.kind].icon;
          return (
            <button
              key={`${item.kind}-${item.id}-${i}`}
              type="button"
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setSelected(i)}
              onClick={() => pick(item)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )}
            >
              <Icon size={14} className={cn('shrink-0', KIND_META[item.kind].cls)} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.desc && (
                <span className="max-w-[10rem] shrink-0 truncate text-xs text-muted-foreground">{item.desc}</span>
              )}
              {i === selected && <CornerDownLeft size={12} className="shrink-0 text-muted-foreground" />}
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-1.5 border-t border-[hsl(var(--border))] px-1 pt-1.5">
        <FileText size={13} className="ml-1 shrink-0 text-amber-500" />
        <input
          data-mention-file-input="true"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              pickFile();
            }
          }}
          placeholder="引用文件：输入绝对路径后回车"
          className="h-7 w-full bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/70"
        />
      </div>
    </div>
  );
}
