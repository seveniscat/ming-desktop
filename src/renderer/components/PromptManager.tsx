import { useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { PromptTemplate } from '../../shared/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';

interface PromptForm {
  name: string;
  trigger: string;
  description: string;
  content: string;
}

const emptyForm: PromptForm = {
  name: '',
  trigger: '',
  description: '',
  content: '',
};

function normalizeTrigger(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/\s+/g, '-').toLowerCase();
}

export default function PromptManager() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      const result = await window.electronAPI.prompts.list();
      setPrompts(result || []);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (prompt: PromptTemplate) => {
    setEditingId(prompt.id);
    setForm({
      name: prompt.name,
      trigger: prompt.trigger,
      description: prompt.description,
      content: prompt.content,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        trigger: normalizeTrigger(form.trigger || form.name),
        description: form.description.trim(),
        content: form.content.trim(),
      };

      if (editingId) {
        await window.electronAPI.prompts.update(editingId, payload);
      } else {
        await window.electronAPI.prompts.create(payload);
      }

      setDialogOpen(false);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to save prompt:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (promptId: string, promptName: string) => {
    if (!confirm(`确定要删除提示词 "${promptName}" 吗？`)) return;
    try {
      await window.electronAPI.prompts.delete(promptId);
      await loadPrompts();
    } catch (error) {
      console.error('Failed to delete prompt:', error);
    }
  };

  const handleToggleEnabled = async (prompt: PromptTemplate) => {
    try {
      await window.electronAPI.prompts.update(prompt.id, { enabled: !prompt.enabled });
      await loadPrompts();
    } catch (error) {
      console.error('Failed to toggle prompt:', error);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-foreground">提示词管理</h1>
            <p className="text-muted-foreground">维护聊天输入框可通过斜杠唤醒的常用提示词</p>
          </div>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={18} />
            新建提示词
          </Button>
        </div>

        {prompts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText size={48} className="text-muted-foreground mb-4" />
              <p className="text-muted-foreground">还没有提示词，点击上方按钮创建一个</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {prompts.map((prompt) => (
              <Card key={prompt.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{prompt.name}</CardTitle>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          /{prompt.trigger}
                        </Badge>
                        <Badge variant={prompt.enabled ? 'default' : 'outline'} className="text-[10px]">
                          {prompt.enabled ? '启用' : '停用'}
                        </Badge>
                      </div>
                      {prompt.description && (
                        <CardDescription className="mt-1">{prompt.description}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleToggleEnabled(prompt)}
                      title={prompt.enabled ? '停用提示词' : '启用提示词'}
                    >
                      {prompt.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-xl bg-[var(--surface-hover)] border border-[hsl(var(--border))] p-3">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
                        {prompt.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(prompt)}
                        className="flex items-center gap-1.5"
                      >
                        <Pencil size={14} />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(prompt.id, prompt.name)}
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive"
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
              <DialogTitle>{editingId ? '编辑提示词' : '新建提示词'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-2 block">名称</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="例如：代码审查、需求拆解、周报润色"
                />
              </div>

              <div>
                <Label className="mb-2 block">斜杠触发词</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono">/</span>
                  <Input
                    value={form.trigger}
                    onChange={(event) => setForm({ ...form, trigger: event.target.value })}
                    placeholder="例如：review"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">描述</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="一句话说明这个提示词的用途"
                />
              </div>

              <div>
                <Label className="mb-2 block">提示词正文</Label>
                <Textarea
                  value={form.content}
                  onChange={(event) => setForm({ ...form, content: event.target.value })}
                  className="min-h-[260px]"
                  placeholder="输入选择后会填入聊天框的提示词内容"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.content.trim()}
              >
                {saving ? '保存中...' : editingId ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
