import { useState, useEffect, useRef, useCallback } from 'react';
import Vditor from 'vditor';
import type { Skill } from '../../shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft, Save, Check } from 'lucide-react';
import 'vditor/dist/index.css';

interface SkillEditorProps {
  skill: Skill;
  onBack: () => void;
  onSaved: () => void;
}

export default function SkillEditor({ skill, onBack, onSaved }: SkillEditorProps) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [content, setContent] = useState(skill.prompt);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const vditorRef = useRef<Vditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Vditor
  useEffect(() => {
    if (!containerRef.current) return;

    const vditor = new Vditor(containerRef.current, {
      height: '100%',
      mode: 'sv',
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', '|',
        'quote', 'code', 'inline-code', '|',
        'link', 'table', '|',
        'undo', 'redo', '|',
        'outline', 'preview', 'fullscreen',
      ],
      placeholder: '输入 Skill prompt 内容...',
      value: content,
      cache: { enable: false },
      preview: { mode: 'both' },
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'classic',
      input: (value) => {
        setContent(value);
        setDirty(true);
      },
      after: () => {
        vditorRef.current = vditor;
      },
    });

    return () => {
      vditorRef.current?.destroy();
      vditorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactively sync Vditor theme with app dark/light mode
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      const isDark = el.classList.contains('dark');
      const theme = isDark ? 'dark' : 'classic';
      vditorRef.current?.setTheme(theme);
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Sync content from parent if skill changes
  useEffect(() => {
    if (vditorRef.current && skill.prompt !== content) {
      vditorRef.current.setValue(skill.prompt);
      setContent(skill.prompt);
    }
    setName(skill.name);
    setDescription(skill.description);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill.id]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI.skills.update(skill.id, {
        name: name.trim(),
        description: description.trim(),
        prompt: content.trim(),
      });
      setDirty(false);
      onSaved();
    } catch (error) {
      console.error('Failed to save skill:', error);
    } finally {
      setSaving(false);
    }
  }, [skill.id, name, description, content, onSaved]);

  // Cmd+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              className="text-lg font-semibold border-none shadow-none h-auto p-0 focus-visible:ring-0"
              placeholder="Skill 名称"
            />
            {dirty && (
              <span className="text-xs text-muted-foreground">未保存</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!dirty && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check size={12} /> 已保存
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !dirty}
            size="sm"
            className="flex items-center gap-1.5"
          >
            <Save size={14} />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[hsl(var(--border))] bg-[var(--surface-hover)]">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">描述</Label>
          <Input
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            placeholder="一句话描述 skill 用途"
            className="h-7 text-sm border-none shadow-none bg-transparent focus-visible:ring-0"
          />
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full" />
      </div>
    </div>
  );
}
