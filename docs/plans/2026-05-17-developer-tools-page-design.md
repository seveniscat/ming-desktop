# Developer Tools Page Design

## Goal

Consolidate developer-facing tools (starting with Tech Stack Analyzer) into a dedicated "Developer Tools" page with a card-grid homepage, making it easy to add more tools in the future.

## Design

### Navigation

- Replace the existing `techstack` tab in NavRail with `devtools` ("开发者工具")
- Same icon position, updated label and icon

### Page Layout

**Card Grid Homepage (default view):**
- Grid of cards, each representing a tool
- Each card shows: icon, tool name, short description
- Initially only "Tech Stack Analyzer" card

**Tool Detail View (on card click):**
- Sets `activeTool` state → renders the tool's component
- Breadcrumb or back button to return to card grid
- `TechStackAnalyzer.tsx` remains unchanged, embedded as a child component

### Tool Registration

Simple array-based registry:

```ts
interface DevTool {
  id: string
  name: string
  description: string
  icon: LucideIcon
  component: React.ComponentType
}
```

Adding a new tool = adding one entry to the array. No routing config changes needed.

## Files to Change

- `src/renderer/components/NavRail.tsx` — rename tab from `techstack` to `devtools`
- `src/renderer/App.tsx` — update tab case to render `DeveloperToolsPage`
- `src/renderer/components/DeveloperToolsPage.tsx` — new file (card grid + tool routing)
- `src/renderer/components/TechStackAnalyzer.tsx` — no changes (embedded as-is)
