import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Skill } from '../../shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { ArrowLeft, Save, Check, PanelRightOpen, PanelRightClose } from 'lucide-react';

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
  const [savedOnce, setSavedOnce] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const isDark = document.documentElement.classList.contains('dark');

  // Sync content from parent if skill changes
  useEffect(() => {
    setContent(skill.prompt);
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
      setSavedOnce(true);
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
          <Button variant="ghost" size="icon" onClick={() => {
            if (dirty && !confirm('有未保存的更改，确定要离开吗？')) return;
            onBack();
          }}>
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
          {!dirty && savedOnce && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check size={12} /> 已保存
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? '关闭预览' : '打开预览'}
          >
            {showPreview ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </Button>
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
      <div className="flex items-start gap-4 px-4 py-2 border-b border-[hsl(var(--border))] bg-[var(--surface-hover)]">
        <div className="flex items-start gap-2 flex-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap pt-1.5">描述</Label>
          <Textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            placeholder="描述 skill 的用途和使用场景"
            className="min-h-[40px] max-h-[80px] text-sm border-none shadow-none bg-transparent focus-visible:ring-0 resize-y p-1"
            rows={1}
          />
        </div>
      </div>

      {/* Split view: Monaco editor + Markdown preview */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`min-w-0 ${showPreview ? 'flex-1' : 'flex-1'}`}>
          <Editor
            height="100%"
            language="markdown"
            theme={isDark ? 'vs-dark' : 'vs'}
            value={content}
            onChange={(value) => {
              setContent(value || '');
              setDirty(true);
            }}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              fontSize: 14,
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              renderLineHighlight: 'line',
              overviewRulerBorder: false,
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        </div>
        {showPreview && (
          <>
            <div className="w-px bg-[hsl(var(--border))]" />
            <div className="flex-1 min-w-0 overflow-y-auto p-6 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
