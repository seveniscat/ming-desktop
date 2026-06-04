import { useState, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Skill, SkillFile } from '../../shared/types';
import { Button } from './ui/button';
import { ArrowLeft, File, Folder, ExternalLink, FileText, ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface SkillViewerProps {
  skill: Skill;
  onBack: () => void;
}

export default function SkillViewer({ skill, onBack }: SkillViewerProps) {
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIDE, setSelectedIDE] = useState<string>('cursor');

  // Load files list
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const fileList = await window.electronAPI.skills.getFiles(skill.id);
      setFiles(fileList || []);
    } catch (error) {
      console.error('Failed to load skill files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
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
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  }, [skill.id]);

  useEffect(() => {
    loadFileContent('SKILL.md');
  }, [skill.id, loadFileContent]);

  // Open in IDE
  const handleOpenInIDE = async () => {
    try {
      await window.electronAPI.skills.openInIDE(skill.id, selectedIDE);
    } catch (error) {
      console.error('Failed to open in IDE:', error);
    }
  };

  const isMarkdown = selectedFile.endsWith('.md');

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
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              加载中...
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText size={32} className="text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">没有文件</p>
              <p className="text-xs text-muted-foreground mt-1 px-4">
                Skill 文件夹: {skill.folderPath}
              </p>
            </div>
          ) : (
            <>
              {/* File count */}
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {files.filter(f => !f.isDirectory).length} 个文件
                {files.filter(f => f.isDirectory).length > 0 &&
                  `, ${files.filter(f => f.isDirectory).length} 个文件夹`}
              </div>
              
              {/* File tree */}
              <div className="space-y-0.5">
                {files.map(file => (
                  <div
                    key={file.path}
                    className={`flex items-center px-2 py-1.5 rounded cursor-pointer text-sm ${
                      selectedFile === file.path
                        ? 'bg-primary/10 text-primary'
                        : file.isDirectory
                        ? 'text-muted-foreground cursor-default'
                        : 'hover:bg-[var(--surface-hover)] text-foreground'
                    }`}
                    onClick={() => !file.isDirectory && loadFileContent(file.path)}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {file.isDirectory ? (
                        <Folder size={14} className="shrink-0 text-muted-foreground" />
                      ) : file.name.endsWith('.md') ? (
                        <FileText size={14} className="shrink-0" />
                      ) : (
                        <File size={14} className="shrink-0" />
                      )}
                      <span className="truncate" title={file.path}>{file.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] bg-[var(--surface-hover)]">
          <span className="text-sm font-medium text-foreground">{selectedFile}</span>
          <div className="flex items-center gap-2">
            <Select value={selectedIDE} onValueChange={setSelectedIDE}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="选择 IDE" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">系统默认</SelectItem>
                <SelectItem value="cursor">Cursor</SelectItem>
                <SelectItem value="vscode">VS Code</SelectItem>
                <SelectItem value="warp">Warp</SelectItem>
                <SelectItem value="antigravity">Antigravity</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleOpenInIDE}
              size="sm"
              className="flex items-center gap-1.5"
            >
              <ExternalLink size={14} />
              打开
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isMarkdown ? (
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
            </article>
          ) : (
            <pre className="text-sm text-foreground whitespace-pre-wrap font-mono bg-[var(--surface-hover)] rounded-lg p-4">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
