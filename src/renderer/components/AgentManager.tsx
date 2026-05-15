import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Bot, Cpu, Sparkles, Wrench } from 'lucide-react';
import type { Agent, Skill } from '../../shared/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { cn } from '@/lib/utils';

interface AgentForm {
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string;
  skills: string[];
}

const emptyForm: AgentForm = {
  name: '',
  description: '',
  model: '',
  systemPrompt: '',
  tools: '',
  skills: [],
};

export default function AgentManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);

  useEffect(() => {
    loadAgents();
    loadProviders();
    loadSkills();
  }, []);

  const loadProviders = async () => {
    try {
      const list = await window.electronAPI.llm.listProviders();
      setProviders(list || []);
    } catch {
      setProviders([]);
    }
  };

  const loadSkills = async () => {
    try {
      const list = await window.electronAPI.skills.list();
      setSkills(list || []);
    } catch (error) {
      console.error('Failed to load skills:', error);
      setSkills([]);
    }
  };

  const availableModels = useMemo(() => {
    const models: { value: string; label: string }[] = [];
    for (const p of providers.filter((provider: any) => provider.enabled)) {
      const enabled = p.enabledModels?.length ? p.enabledModels : p.models || [];
      for (const model of enabled) {
        if (!models.some((item) => item.value === model)) {
          models.push({ value: model, label: `${model} (${p.name})` });
        }
      }
    }
    return models;
  }, [providers]);

  const skillNameMap = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill.name])),
    [skills]
  );

  const loadAgents = async () => {
    try {
      const list = await window.electronAPI.agents.list();
      setAgents(list);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      description: agent.description,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools.join(', '),
      skills: agent.skills || [],
    });
    setDialogOpen(true);
  };

  const toggleSkill = (skillId: string) => {
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(skillId)
        ? current.skills.filter((id) => id !== skillId)
        : [...current.skills, skillId],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tools = form.tools
        .split(',')
        .map((tool) => tool.trim())
        .filter(Boolean);

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model,
        systemPrompt: form.systemPrompt.trim(),
        tools,
        skills: form.skills,
      };

      if (editingId) {
        await window.electronAPI.agents.update(editingId, payload);
      } else {
        await window.electronAPI.agents.create(payload);
      }
      setDialogOpen(false);
      await Promise.all([loadAgents(), loadSkills()]);
    } catch (error) {
      console.error('Failed to save agent:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string, agentName: string) => {
    if (!confirm(`确定要删除 Agent "${agentName}" 吗？`)) return;
    try {
      await window.electronAPI.agents.delete(agentId);
      await loadAgents();
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-foreground">Agent 管理</h1>
            <p className="text-muted-foreground">创建 Agent，并为它们绑定可复用的 skill</p>
          </div>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus size={18} />
            创建 Agent
          </Button>
        </div>

        {agents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bot size={48} className="text-muted-foreground mb-4" />
              <p className="text-muted-foreground">还没有 Agent，点击上方按钮创建一个</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                        <Bot size={20} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
                        {agent.description && (
                          <CardDescription className="mt-1">
                            {agent.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Cpu size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">
                        {agent.model || 'Provider 默认'}
                      </span>
                    </div>

                    {agent.tools.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                          <Wrench size={12} />
                          Tools
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.tools.map((tool) => (
                            <Badge key={tool} variant="secondary" className="text-xs">
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {agent.skills.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                          <Sparkles size={12} />
                          Skills
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.skills.map((skillId) => (
                            <Badge key={skillId} variant="outline" className="text-xs">
                              {skillNameMap.get(skillId) || skillId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(agent)}
                        className="flex items-center gap-1.5"
                      >
                        <Pencil size={14} />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(agent.id, agent.name)}
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
              <DialogTitle>{editingId ? '编辑 Agent' : '创建 Agent'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-2 block">名称</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Agent 名称"
                />
              </div>

              <div>
                <Label className="mb-2 block">描述</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Agent 描述"
                />
              </div>

              <div>
                <Label className="mb-2 block">模型</Label>
                <Select
                  value={form.model || '__default__'}
                  onValueChange={(value) => setForm({ ...form, model: value === '__default__' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="留空使用 Provider 默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Provider 默认</SelectItem>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">System Prompt</Label>
                <Textarea
                  value={form.systemPrompt}
                  onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
                  className="min-h-[160px]"
                  placeholder="系统提示词"
                />
              </div>

              <div>
                <Label className="mb-2 block">工具</Label>
                <Input
                  value={form.tools}
                  onChange={(event) => setForm({ ...form, tools: event.target.value })}
                  placeholder="逗号分隔，例如：search, calculator, weather"
                />
                <p className="text-xs text-muted-foreground mt-1">多个工具名用英文逗号分隔</p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Label>Skills</Label>
                  <span className="text-xs text-muted-foreground">
                    选中的 skill 会追加到 Agent 的 system prompt
                  </span>
                </div>

                {skills.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    还没有可用 skill，请先到 Skills 页面创建。
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {skills.map((skill) => {
                      const selected = form.skills.includes(skill.id);
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          className={cn(
                            'rounded-xl border p-3 text-left transition-colors',
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/40'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-foreground">{skill.name}</div>
                              {skill.description && (
                                <div className="mt-1 text-xs text-muted-foreground">{skill.description}</div>
                              )}
                            </div>
                            <Badge variant={selected ? 'default' : 'outline'} className="text-[10px]">
                              {selected ? '已选中' : skill.enabled ? '可用' : '停用'}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.systemPrompt.trim()}
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
