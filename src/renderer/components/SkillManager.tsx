import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Eye, Trash2, Sparkles, ToggleLeft, ToggleRight, RefreshCw, FolderOpen, Upload, FileText, Calendar, ExternalLink } from 'lucide-react';
import type { Skill, Agent, SkillSyncResult } from '../../shared/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import SkillViewer from './SkillViewer';

const sourceTypeLabels: Record<string, string> = {
  builtin: '内置',
  user: '用户创建',
  project: '项目级',
  imported: '已导入',
  codex: 'Codex',
  agents: 'Agents',
  plugin: '插件',
  'codex-system': '系统',
  local: '本地',
};

interface SkillForm {
  name: string;
  description: string;
  prompt: string;
}

const emptyForm: SkillForm = {
  name: '',
  description: '',
  prompt: '',
};

export default function SkillManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [skillFileCounts, setSkillFileCounts] = useState<Map<string, number>>(new Map());
  const [skillIDEs, setSkillIDEs] = useState<Map<string, string>>(new Map());

  const handleImportZip = useCallback(async (filePath: string) => {
    setImporting(true);
    setSyncMessage('');
    try {
      const result = await window.electronAPI.skills.importZip(filePath);
      setSyncMessage(`✅ 已导入 Skill: ${result.skillName}`);
      await loadData();
    } catch (error: any) {
      setSyncMessage(`❌ 导入失败: ${error.message || '未知错误'}`);
    } finally {
      setImporting(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.zip')) {
      setSyncMessage('❌ 请拖入 .zip 文件');
      return;
    }

    // Electron's File object has a `path` property for local files
    const filePath = (file as any).path;
    if (filePath) {
      handleImportZip(filePath);
    }
  }, [handleImportZip]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<Skill[]> => {
    try {
      const [skillList, agentList] = await Promise.all([
        window.electronAPI.skills.list(),
        window.electronAPI.agents.list(),
      ]);
      setSkills(skillList || []);
      setAgents(agentList || []);
      
      // Load file counts for each skill
      const fileCounts = new Map<string, number>();
      for (const skill of skillList || []) {
        try {
          const files = await window.electronAPI.skills.getFiles(skill.id);
          fileCounts.set(skill.id, files?.length || 0);
        } catch {
          fileCounts.set(skill.id, 0);
        }
      }
      setSkillFileCounts(fileCounts);
      
      return skillList || [];
    } catch (error) {
      console.error('Failed to load skills:', error);
      return [];
    }
  };

  const usageMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const agent of agents) {
      for (const skillId of agent.skills || []) {
        map.set(skillId, (map.get(skillId) || 0) + 1);
      }
    }
    return map;
  }, [agents]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        prompt: form.prompt.trim(),
      };

      if (editingId) {
        await window.electronAPI.skills.update(editingId, payload);
      } else {
        await window.electronAPI.skills.create(payload);
      }

      setDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error('Failed to save skill:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skillId: string, skillName: string) => {
    if (!confirm(`确定要删除 Skill "${skillName}" 吗？`)) return;
    try {
      await window.electronAPI.skills.delete(skillId);
      await loadData();
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  const handleToggleEnabled = async (skill: Skill) => {
    try {
      await window.electronAPI.skills.update(skill.id, { enabled: !skill.enabled });
      await loadData();
    } catch (error) {
      console.error('Failed to toggle skill:', error);
    }
  };

  const handleSyncLocal = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = (await window.electronAPI.skills.syncLocal()) as SkillSyncResult;
      setSkills(result.skills || []);
      const agentList = await window.electronAPI.agents.list();
      setAgents(agentList || []);
      const parts = [
        `已扫描 ${result.total} 个 skill`,
        result.created > 0 ? `新增 ${result.created} 个` : null,
        result.updated > 0 ? `更新 ${result.updated} 个` : null,
        result.skipped > 0 ? `跳过 ${result.skipped} 个（无变化）` : null,
        result.removed > 0 ? `移除 ${result.removed} 个（源文件不存在）` : null,
      ].filter(Boolean).join('，');
      setSyncMessage(parts);
    } catch (error) {
      console.error('Failed to sync local skills:', error);
      setSyncMessage('同步失败，请查看控制台日志');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenInIDE = async (skillId: string) => {
    const ideType = skillIDEs.get(skillId) || 'cursor';
    try {
      await window.electronAPI.skills.openInIDE(skillId, ideType);
    } catch (error) {
      console.error('Failed to open in IDE:', error);
    }
  };

  const handleIDEChange = (skillId: string, ideType: string) => {
    setSkillIDEs(prev => new Map(prev).set(skillId, ideType));
  };

  return (
    <div
      className={`h-full ${editingSkill ? '' : 'overflow-y-auto p-8'}`}
      onDragOver={editingSkill ? undefined : handleDragOver}
      onDragLeave={editingSkill ? undefined : handleDragLeave}
      onDrop={editingSkill ? undefined : handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 px-16 py-12">
            <Upload size={48} className="text-primary" />
            <p className="text-xl font-semibold text-foreground">松开以安装 Skill</p>
            <p className="text-sm text-muted-foreground">支持包含 SKILL.md 的 .zip 文件</p>
          </div>
        </div>
      )}
      {editingSkill ? (
        <SkillViewer
          skill={editingSkill}
          onBack={() => setEditingSkill(null)}
        />
      ) : (
      <>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-foreground">Skill 管理</h1>
              <p className="text-muted-foreground">维护可复用的 prompt 模板，并分配给 Agent</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={handleSyncLocal}
                disabled={syncing}
                className="flex items-center gap-2"
              >
                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                {syncing ? '同步中...' : '同步本地 Skills'}
              </Button>
              <Button onClick={openCreate} className="flex items-center gap-2">
                <Plus size={18} />
                创建 Skill
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.zip';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      const filePath = (file as any).path;
                      if (filePath) handleImportZip(filePath);
                    }
                  };
                  input.click();
                }}
                disabled={importing}
                className="flex items-center gap-2"
              >
                <Upload size={18} />
                {importing ? '导入中...' : '导入 ZIP'}
              </Button>
            </div>
          </div>

          {syncMessage && (
            <div className="mb-6 rounded-lg border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
              {syncMessage}
            </div>
          )}

          {skills.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles size={48} className="text-muted-foreground mb-4" />
                <p className="text-muted-foreground">还没有 Skill，点击上方按钮创建一个</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {skills.map((skill) => (
                <Card key={skill.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{skill.name}</CardTitle>
                          <Badge variant={skill.enabled ? 'default' : 'outline'} className="text-[10px]">
                            {skill.enabled ? '启用' : '停用'}
                          </Badge>
                          {skill.sourceType && (
                            <Badge variant={skill.sourceType === 'project' ? 'default' : 'secondary'} className="text-[10px]">
                              {sourceTypeLabels[skill.sourceType] || skill.sourceType}
                            </Badge>
                          )}
                        </div>
                        {skill.description && (
                          <CardDescription className="mt-1">{skill.description}</CardDescription>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleEnabled(skill)}
                        title={skill.enabled ? '停用 skill' : '启用 skill'}
                      >
                        {skill.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* File count and folder path */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <FileText size={12} />
                          <span>{skillFileCounts.get(skill.id) || 0} 个文件</span>
                        </div>
                        {skill.folderPath && (
                          <div className="flex items-center gap-1.5 truncate">
                            <FolderOpen size={12} className="flex-shrink-0" />
                            <span className="truncate" title={skill.folderPath}>
                              {skill.folderPath.split('/').slice(-2).join('/')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Usage and update time */}
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          已被 {usageMap.get(skill.id) || 0} 个 Agent 使用
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar size={12} />
                          <span>{new Date(skill.updatedAt).toLocaleDateString('zh-CN')}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEdit(skill)}
                          className="flex items-center gap-1.5"
                        >
                          <Eye size={14} />
                          预览
                        </Button>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenInIDE(skill.id)}
                            className="flex items-center gap-1.5 h-8"
                          >
                            <ExternalLink size={14} />
                            {skillIDEs.get(skill.id) === 'vscode' ? 'VS Code' : 
                             skillIDEs.get(skill.id) === 'warp' ? 'Warp' :
                             skillIDEs.get(skill.id) === 'antigravity' ? 'Antigravity' :
                             skillIDEs.get(skill.id) === 'cursor' ? 'Cursor' : '打开'}
                          </Button>
                          <Select value={skillIDEs.get(skill.id) || 'cursor'} onValueChange={(value) => handleIDEChange(skill.id, value)}>
                            <SelectTrigger className="w-[40px] h-8 px-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cursor">Cursor</SelectItem>
                              <SelectItem value="vscode">VS Code</SelectItem>
                              <SelectItem value="warp">Warp</SelectItem>
                              <SelectItem value="antigravity">Antigravity</SelectItem>
                              <SelectItem value="default">系统默认</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(skill.id, skill.name)}
                          className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive ml-auto"
                        >
                          <Trash2 size={14} />
                          删除
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId ? '编辑 Skill' : '创建 Skill'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label className="mb-2 block">名称</Label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="例如：PR Review、Bug Triage、API Design"
                  />
                </div>

                <div>
                  <Label className="mb-2 block">描述</Label>
                  <Input
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="一句话说明 skill 的用途"
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Prompt</Label>
                  <Textarea
                    value={form.prompt}
                    onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                    className="min-h-[260px]"
                    placeholder="输入会注入到 Agent system prompt 的内容"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.prompt.trim()}
                >
                  {saving ? '保存中...' : editingId ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </>
      )}
    </div>
  );
}
