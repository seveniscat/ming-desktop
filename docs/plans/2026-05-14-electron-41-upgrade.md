# Electron 28 → 41 Upgrade Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Electron from v28 to v41, along with all related build tooling, while keeping the app fully functional.

**Architecture:** Incremental dependency upgrade: first Electron + Node native modules, then build tooling (electron-vite, electron-builder), then verification. The codebase already follows modern Electron patterns (contextBridge wrappers, nodeIntegration: false, contextIsolation: true) so minimal code changes are needed.

**Tech Stack:** Electron 41, Node.js 24, Chromium 146, V8 14.6, electron-vite, electron-builder, better-sqlite3

---

## Impact Analysis

### Breaking Changes that Affect This Project

| Change | Version | Impact | Code Change Needed |
|--------|---------|--------|-------------------|
| Node.js v18 → v24 | 41 | better-sqlite3 must rebuild with C++20 | No, rebuild handles it |
| Native modules require C++20 | 33 | better-sqlite3 compilation | No, recent version supports it |
| macOS 10.15 dropped | 33 | Min macOS 12 Monterey | Update build targets |
| macOS 11 dropped | 38 | Min macOS 12 Monterey | Already covered above |

### Breaking Changes NOT Affecting This Project (verified)

| Change | Why Safe |
|--------|----------|
| `ipcRenderer` over contextBridge (29) | Already wraps individual methods, not the module |
| `File.path` removed (32) | Not used |
| Navigation APIs deprecated (32) | Not used |
| `BrowserView` deprecated (30) | Not used |
| `setPreloads`/`getPreloads` deprecated (35) | Not used |
| `NativeImage.getBitmap()` deprecated (36) | Not used |
| `renderer-process-crashed` removed (29) | Not used |
| `console-message` event signature (35) | Not used |

---

### Task 1: Upgrade Electron and Core Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Upgrade Electron to v41**

Run:
```bash
npm install electron@41 --save-dev
```

**Step 2: Upgrade electron-builder to latest**

Run:
```bash
npm install electron-builder@latest --save-dev
```

**Step 3: Upgrade electron-rebuild to latest**

Run:
```bash
npm install electron-rebuild@latest --save-dev
```

**Step 4: Upgrade better-sqlite3 to latest (must support Node 24 / C++20)**

Run:
```bash
npm install better-sqlite3@latest
```

**Step 5: Rebuild native modules for Electron 41**

Run:
```bash
npm run postinstall
```
Expected: better-sqlite3 rebuilt successfully for Electron 41 / Node 24

**Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade Electron 28 → 41 with core dependencies"
```

---

### Task 2: Update electron-vite Configuration

**Files:**
- Modify: `electron.vite.config.ts`

**Step 1: Upgrade electron-vite to latest**

Run:
```bash
npm install electron-vite@latest --save-dev
```

**Step 2: Verify electron.vite.config.ts is compatible**

Read `electron.vite.config.ts` and verify no deprecated options. The current config uses:
- `externalizeDepsPlugin()` — still supported
- `react()` plugin — still supported
- `resolve.alias` — still supported

No changes should be needed. If electron-vite v5 → v6 has breaking changes, check the [migration guide](https://electron-vite.org/guide/migration).

**Step 3: Commit (if changes were made)**

```bash
git add electron.vite.config.ts package.json package-lock.json
git commit -m "chore: upgrade electron-vite to latest"
```

---

### Task 3: Update electron-builder Build Targets

**Files:**
- Modify: `package.json` (build section)

**Step 1: Update macOS build target**

In `package.json`, the `build.mac` section currently targets x64 + arm64. Electron 41 drops macOS < 12 support. Update the target to reflect minimum macOS 12:

The `mac.target` can stay as-is (DMG, x64 + arm64), but add `minimumSystemVersion`:

```json
"mac": {
  "category": "public.app-category.developer-tools",
  "minimumSystemVersion": "12.0.0",
  "target": [
    {
      "target": "dmg",
      "arch": ["x64", "arm64"]
    }
  ]
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: set minimum macOS 12 for Electron 41 build"
```

---

### Task 4: Upgrade Vite and React Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Upgrade Vite to latest v6**

Run:
```bash
npm install vite@latest --save-dev
```

Note: electron-vite bundles its own Vite internally, but the renderer plugin uses `@vitejs/plugin-react`. If electron-vite handles Vite, this step may be a no-op. Check for peer dependency warnings.

**Step 2: Upgrade @vitejs/plugin-react**

Run:
```bash
npm install @vitejs/plugin-react@latest --save-dev
```

**Step 3: Upgrade Vitest to latest**

Run:
```bash
npm install vitest@latest --save-dev
npm install @vitest/ui@latest --save-dev
```

**Step 4: Upgrade TypeScript to latest v5**

Run:
```bash
npm install typescript@latest --save-dev
```

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade Vite, Vitest, TypeScript, and React plugin"
```

---

### Task 5: Type-Check and Build Verification

**Files:** None (verification only)

**Step 1: Run TypeScript type-check**

Run:
```bash
npm run type-check
```
Expected: No errors. If Electron 41 has new types or changed interfaces, fix them.

**Step 2: Run full build**

Run:
```bash
npm run build
```
Expected: Build succeeds for main, preload, and renderer.

**Step 3: If type errors, fix them**

Common issues:
- `Electron.WebContents` type changes
- New required properties on `BrowserWindow` options
- Deprecated APIs flagged by TypeScript

Fix each error and re-run type-check until clean.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from Electron 41 upgrade"
```

---

### Task 6: Run-time Verification

**Files:** None (manual testing)

**Step 1: Start the dev server**

Run:
```bash
npm run dev
```

**Step 2: Verify core features work**

Check each feature manually:
- [ ] App launches with correct window size and styling
- [ ] Agent creation and chat (uses IPC invoke)
- [ ] Streaming chat (uses IPC on/send for chunks)
- [ ] Debug panel opens and receives events
- [ ] LLM provider management (CRUD)
- [ ] Configuration get/set
- [ ] Git integration (scan repos, heatmap)
- [ ] Daily report generation
- [ ] SQLite database operations (better-sqlite3 native module)
- [ ] Dialog (file open dialog)

**Step 3: Check DevTools console for deprecation warnings**

Open DevTools and look for any `DeprecationWarning` messages from Electron. Address any that appear.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve runtime issues from Electron 41 upgrade"
```

---

### Task 7: Test Suite Verification

**Files:** None (verification only)

**Step 1: Run existing tests**

Run:
```bash
npm test
```
Expected: All tests pass.

**Step 2: If tests fail, investigate and fix**

Common causes:
- Native module loading issues in test environment
- TypeScript type changes affecting test assertions

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from Electron 41 upgrade"
```

---

### Task 8: Final Cleanup and Documentation

**Files:**
- Modify: `package.json` (optional cleanup)

**Step 1: Review package.json for any stale dependencies**

Run:
```bash
npm outdated
```

Check if any remaining dev dependencies need updates.

**Step 2: Clean install test**

Run:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```
Expected: Clean install and build succeed.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Electron 28 → 41 upgrade complete"
```

---

## Dependency Version Summary

| Package | Before | After |
|---------|--------|-------|
| electron | ^28.0.0 | ^41.0.0 |
| electron-builder | ^24.9.1 | latest |
| electron-rebuild | ^3.2.9 | latest |
| electron-vite | ^5.0.0 | latest |
| better-sqlite3 | ^12.9.0 | latest |
| vite | ^5.0.10 | latest |
| vitest | ^1.1.0 | latest |
| typescript | ^5.3.3 | latest |

## Risk Assessment

- **Low risk**: The preload script already uses the correct contextBridge wrapping pattern. No BrowserView, File.path, or deprecated navigation APIs are used.
- **Medium risk**: better-sqlite3 native module rebuild. If the latest version doesn't support Node 24 / C++20, may need to find an alternative or patch.
- **Low risk**: electron-vite compatibility. The latest version should support Electron 41.
