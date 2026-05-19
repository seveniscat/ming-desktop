# Skill Markdown Editor Design

## Summary

Replace the plain textarea for skill prompt editing with a full-page Vditor-based markdown editor with split view (source + live preview).

## Current State

- Skills are managed via `SkillManager.tsx` grid page
- Editing uses a dialog with a `<textarea>` for the prompt field
- Prompts are stored as plain text in SQLite `skills.prompt` column
- Some skills have YAML frontmatter (from synced local SKILL.md files)

## Design

### Navigation Flow

- Clicking "edit" on a skill card navigates to `/skills/:id/edit`
- Full-page editor view with back button to return to Skills grid
- The create dialog remains for quick creation (still uses textarea)

### Editor Page Layout

```
┌─────────────────────────────────────────────┐
│ ← Back    Skill Name       [Save] [Saved ✓] │
├─────────────────────────────────────────────┤
│  Name: [editable]  Description: [editable]  │
├──────────────────────┬──────────────────────┤
│                      │                      │
│   Vditor Editor      │   Live Preview       │
│   (source mode)      │   (rendered md)      │
│                      │                      │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

### Components

1. **`SkillEditor.tsx`** — Full-page editor component
   - Uses Vditor in split view mode (`sv` mode with built-in preview)
   - Header with skill name, back button, save status
   - Collapsible metadata section (name, description)
   - Cmd+S keyboard shortcut for save
   - Unsaved changes indicator

### Technical Decisions

- **Vditor** for editor — native split view, toolbar, syntax highlighting
- **Auto-save** — debounced (1.5s after last keystroke) + explicit Save button
- **Frontmatter** — parse YAML frontmatter from prompt content; extract name/description into editable fields
- **Route**: `/skills/:id/edit` using existing React Router setup

### What Doesn't Change

- Skills grid page (`SkillManager.tsx`) — stays as-is
- Create dialog — stays for quick creation
- Database schema and IPC handlers — unchanged
- Skill types and interfaces — unchanged

### New Dependency

- `vditor` npm package
