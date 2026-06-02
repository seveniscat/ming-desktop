import { useState, useEffect, useRef, useCallback } from 'react';
import Vditor from 'vditor';
import type { Skill, SkillFile } from '../../shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowLeft, Save, Check, FilePlus, Trash2, File } from 'lucide-react';
import 'vditor/dist/index.css';

interface SkillEditorProps {
  skill: Skill;
  onBack: () => void;
  onSaved: () => void;
}

export default function SkillEditor({ skill, onBack, onSaved }: SkillEditorProps) {
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const vditorRef = useRef<Vditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = document.documentElement.classList.contains('dark');

  // Load files list
  const loadFiles = useCallback(async () => {
    try {
      const fileList = await window.electronAPI.skills.getFiles(skill.id);
      setFiles(fileList || []);
    } catch (error) {
      console.error('Failed to load skill files:', error);
    }
  }, [skill.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Load file content
  const loadFileContent = useCallback(async (filePath: string) => {
    try {
      const fileContent = await window.electronAPI.skills.readFile(skill.id, filePath);
      setContent(fileContent);
      setSelectedFile(filePath);
      vditorRef.current?.setValue(fileContent);
      setDirty(false);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  }, [skill.id]);

  useEffect(() => {
    loadFileContent('SKILL.md');
  }, [skill.id, loadFileContent]);

  // Initialize Vditor
  useEffect(() => {
    if (!containerRef.current) return;

    const vditor = new Vditor(containerRef.current, {
      height: '100%',
      mode: 'sv',
      lang: 'en_US', // Use English (US) to avoid CDN i18n loading
      theme: isDark ? 'dark' : 'classic',
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', '|',
        'quote', 'code', 'inline-code', '|',
        'link', 'table', '|',
        'undo', 'redo', '|',
        'preview',
      ],
      placeholder: 'Type here...',
      value: content,
      cache: { enable: false },
      preview: { mode: 'both', theme: { current: isDark ? 'dark' : 'classic' } },
      cdn: '', // Use local assets instead of CDN
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
    // Only initialize once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save current file
  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await window.electronAPI.skills.writeFile(skill.id, selectedFile, content);
      setDirty(false);
      setSavedOnce(true);
      onSaved();
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setSaving(false);
    }
  }, [skill.id, selectedFile, content, onSaved]);

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

  // Create new file
  const handleNewFile = async () => {
    const name = prompt('文件名（包含路径，例如：scripts/test.sh）：');
    if (!name) return;
    
    const filePath = name.startsWith('/') ? name.slice(1) : name;
    try {
      await window.electronAPI.skills.writeFile(skill.id, filePath, '');
      await loadFiles();
      loadFileContent(filePath);
    } catch (error) {
      console.error('Failed to create file:', error);
      alert('创建文件失败');
    }
  };

  // Delete file
  const handleDeleteFile = async (filePath: string) => {
    if (filePath === 'SKILL.md') {
      alert('不能删除 SKILL.md');
      return;
    }
    if (!confirm(`确定要删除 ${filePath} 吗？`)) return;
    
    try {
      await window.electronAPI.skills.deleteFile(skill.id, filePath);
      await loadFiles();
      if (selectedFile === filePath) {
        loadFileContent('SKILL.md');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('删除文件失败');
    }
  };

  return (
    <div className="flex h-full">
      {/* Left: File tree */}
      <div className="w-64 border-r border-[hsl(var(--border))] bg-[var(--surface)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
            <ArrowLeft size={14} className="mr-1" />
            返回
          </Button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-0.5">
            {files.map(file => (
              <div
                key={file.path}
                className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm ${
                  selectedFile === file.path
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-[var(--surface-hover)] text-foreground'
                }`}
                onClick={() => !file.isDirectory && loadFileContent(file.path)}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <File size={14} className="shrink-0" />
                  <span className="truncate">{file.name}</span>
                </div>
                {!file.isDirectory && file.path !== 'SKILL.md' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* New file button */}
        <div className="p-2 border-t border-[hsl(var(--border))]">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNewFile}
            className="w-full flex items-center gap-1.5"
          >
            <FilePlus size={14} />
            新建文件
          </Button>
        </div>
      </div>

      {/* Right: Editor */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] bg-[var(--surface-hover)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{selectedFile}</span>
            {dirty && <span className="text-xs text-muted-foreground">未保存</span>}
          </div>
          <div className="flex items-center gap-2">
            {!dirty && savedOnce && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check size={12} /> 已保存
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Save size={14} />
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>

        {/* Vditor container */}
        <div className="flex-1 overflow-hidden">
          <div ref={containerRef} className="h-full" />
        </div>
      </div>
    </div>
  );
}
