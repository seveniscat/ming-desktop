# Skill Markdown Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-page Vditor markdown editor for editing skill prompts, replacing the textarea in the edit dialog.

**Architecture:** The app uses state-based routing (no React Router). The editor will be a sub-view within SkillManager — when a skill is being edited, SkillManager renders a `SkillEditor` component instead of the grid. Vditor provides native split-view (source + preview) mode.

**Tech Stack:** Vditor (markdown editor), React, TypeScript, existing TailwindCSS + shadcn components.

---

### Task 1: Install Vditor dependency

**Files:**
- Modify: `package.json`

**Step 1: Install vditor**

Run: `npm install vditor`

**Step 2: Verify installation**

Run: `npm ls vditor`
Expected: `vditor@x.x.x` listed without errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vditor dependency for skill markdown editor"
```

---

### Task 2: Create SkillEditor component

**Files:**
- Create: `src/renderer/components/SkillEditor.tsx`

**Step 1: Create the SkillEditor component**

```tsx
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
  const [lastSaved, setLastSaved] = useState(skill.updatedAt);
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
    // Only initialize once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync content from parent if skill changes
  useEffect(() => {
    if (vditorRef.current && skill.prompt !== content) {
      vditorRef.current.setValue(skill.prompt);
      setContent(skill.prompt);
    }
    setName(skill.name);
    setDescription(skill.description);
    setLastSaved(skill.updatedAt);
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
      setLastSaved(new Date().toISOString());
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
```

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to SkillEditor.tsx (other existing errors are OK)

**Step 3: Commit**

```bash
git add src/renderer/components/SkillEditor.tsx
git commit -m "feat: add SkillEditor component with Vditor split-view markdown editor"
```

---

### Task 3: Wire SkillEditor into SkillManager

**Files:**
- Modify: `src/renderer/components/SkillManager.tsx`

**Step 1: Add editingSkillId state and import SkillEditor**

In `SkillManager.tsx`, add import at top:
```tsx
import SkillEditor from './SkillEditor';
```

Add state after existing state declarations (after line 32):
```tsx
const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
```

**Step 2: Change openEdit to set editingSkill instead of opening dialog**

Replace the `openEdit` function (lines 67-75) with:
```tsx
const openEdit = (skill: Skill) => {
  setEditingSkill(skill);
};
```

**Step 3: Add conditional rendering for editor vs grid**

Replace the return statement. At the top of the return (after `<div className="h-full overflow-y-auto p-8">`), add a conditional:

```tsx
// If editing a skill, show the full-page editor
if (editingSkill) {
  return (
    <div className="h-full">
      <SkillEditor
        skill={editingSkill}
        onBack={() => setEditingSkill(null)}
        onSaved={async () => {
          await loadData();
          // Re-fetch the updated skill to keep editor in sync
          const updated = skills.find(s => s.id === editingSkill.id);
          if (updated) setEditingSkill(updated);
        }}
      />
    </div>
  );
}
```

Place this right after `return (` and the outer `<div className="h-full overflow-y-auto p-8">`, so the full structure becomes:

```tsx
return (
  <div className="h-full overflow-y-auto p-8">
    {editingSkill ? (
      <div className="h-full">
        <SkillEditor
          skill={editingSkill}
          onBack={() => setEditingSkill(null)}
          onSaved={async () => {
            await loadData();
            const updated = skills.find(s => s.id === editingSkill.id);
            if (updated) setEditingSkill(updated);
          }}
        />
      </div>
    ) : (
      <>
        {/* ... existing grid content ... */}
      </>
    )}
  </div>
);
```

Wrap the existing grid content (everything from `<div className="max-w-5xl mx-auto">` to the closing `</Dialog>`) inside the `<>...</>` fragment.

**Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

**Step 5: Commit**

```bash
git add src/renderer/components/SkillManager.tsx
git commit -m "feat: wire SkillEditor into SkillManager with full-page edit view"
```

---

### Task 4: Style Vditor to match app theme

**Files:**
- Modify: `src/renderer/components/SkillEditor.tsx`

**Step 1: Add CSS overrides for Vditor to match app theme**

Add a `<style>` tag or CSS class overrides in SkillEditor to make Vditor blend with the app's dark/light theme. Add at the bottom of the component's return, or as a separate CSS import:

```css
/* In SkillEditor, add inline styles or a useEffect to apply Vditor theme */
```

In the `useEffect` that initializes Vditor, set the theme option:
```tsx
const vditor = new Vditor(containerRef.current, {
  // ... existing options ...
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'classic',
  preview: {
    mode: 'both',
    theme: {
      current: document.documentElement.classList.contains('dark') ? 'dark' : 'classic',
    },
  },
});
```

Also add a `className` to the editor container to control sizing:
```tsx
<div ref={containerRef} className="h-full vditor-container" />
```

**Step 2: Verify in browser**

Run: `npm run dev`
1. Open the Skills page
2. Click edit on any skill
3. Verify Vditor renders with split view (source + preview)
4. Verify dark/light theme matches the app
5. Verify back button returns to grid

**Step 3: Commit**

```bash
git add src/renderer/components/SkillEditor.tsx
git commit -m "style: apply app theme to Vditor editor and fix layout"
```

---

### Task 5: Test and polish

**Step 1: Run the dev server and test the full flow**

Run: `npm run dev`

Test checklist:
1. [ ] Skills grid loads correctly
2. [ ] Clicking "编辑" opens full-page editor
3. [ ] Vditor renders with split view (source + preview)
4. [ ] Editing markdown updates preview in real-time
5. [ ] Name and description fields are editable
6. [ ] "未保存" indicator shows when content changes
7. [ ] Clicking Save persists changes (refresh to verify)
8. [ ] Cmd+S triggers save
9. [ ] Back button returns to grid with updated data
10. [ ] Create dialog still works for new skills
11. [ ] Dark mode and light mode both look correct

**Step 2: Fix any issues found during testing**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: polish skill editor UX and fix testing issues"
```
